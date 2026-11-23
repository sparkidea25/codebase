import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Codebase-Workspace',
}

class GitHubApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

async function github(path: string, token: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { ...headers, Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok) {
    const detail =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : 'No error details returned.'
    const reason = response.status === 401
      ? 'The GitHub token is invalid or expired.'
      : response.status === 403
        ? response.headers.get('x-ratelimit-remaining') === '0'
          ? 'The GitHub API rate limit has been reached.'
          : 'The token may not have permission for this request.'
        : response.status === 404
          ? 'GitHub could not find this endpoint or resource, or the token cannot access it.'
          : 'The GitHub API request failed.'
    throw new GitHubApiError(`${reason} (HTTP ${response.status}, ${path}): ${detail}`, response.status)
  }
  return data
}

function settledOr<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  warnings: string[],
): T {
  if (result.status === 'fulfilled') return result.value
  warnings.push(result.reason instanceof Error ? result.reason.message : 'A GitHub request failed.')
  return fallback
}

export async function GET(request: Request) {
  const token = (await cookies()).get('github_token')?.value
  if (!token) {
    return NextResponse.json({
      error: 'No GitHub token is connected. Enter a GitHub personal access token to continue.',
      code: 'GITHUB_NOT_CONFIGURED',
    }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const section = searchParams.get('section') ?? 'overview'
  const q = searchParams.get('q')?.slice(0, 100) ?? ''

  try {
    if (section === 'repositories' || section === 'starred') {
      const starred = section === 'starred'
      const repos = await github(starred ? '/user/starred?per_page=100&sort=updated' : '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', token)
      const filtered = q ? repos.filter((repo: { full_name: string; description?: string }) => `${repo.full_name} ${repo.description ?? ''}`.toLowerCase().includes(q.toLowerCase())) : repos
      return NextResponse.json({ repos: filtered })
    }
    if (section === 'issues' || section === 'pulls') {
      const query = section === 'issues' ? 'is:issue is:open assignee:@me' : 'is:pr is:open author:@me'
      const result = await github(`/search/issues?q=${encodeURIComponent(`${query} ${q}`)}&per_page=50&sort=updated`, token)
      return NextResponse.json({ items: result.items })
    }
    if (section === 'activity') {
      return NextResponse.json({ events: await github('/user/events?per_page=30', token) })
    }

    const [user, repos] = await Promise.all([
      github('/user', token),
      github('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', token),
    ])
    const [starredResult, eventsResult, issuesResult, pullsResult, contributionResult] = await Promise.allSettled([
      github('/user/starred?per_page=100', token),
      github('/user/events?per_page=8', token),
      github('/search/issues?q=is%3Aissue+is%3Aopen+assignee%3A%40me&per_page=1', token),
      github('/search/issues?q=is%3Apr+is%3Aopen+author%3A%40me&per_page=1', token),
      (async () => {
        const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: 'query { viewer { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { contributionCount date } } } } } }' }),
        })
        if (!response.ok) throw new Error(`GitHub GraphQL returned HTTP ${response.status}.`)
        const data = await response.json()
        return data.data?.viewer?.contributionsCollection?.contributionCalendar ?? null
      })(),
    ])
    const warnings: string[] = []
    const starred = settledOr(starredResult, [], warnings)
    const events = settledOr(eventsResult, [], warnings)
    const issues = settledOr(issuesResult, { total_count: 0 }, warnings)
    const pulls = settledOr(pullsResult, { total_count: 0 }, warnings)
    const contributions = settledOr(contributionResult, null, warnings)
    return NextResponse.json({ user, repos, starredCount: starred.length, events, issueCount: issues.total_count, pullCount: pulls.total_count, contributions, warnings })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to load GitHub data.',
      code: 'GITHUB_API_ERROR',
    }, { status: error instanceof GitHubApiError ? error.status : 502 })
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  const token = typeof body === 'object' && body !== null && 'token' in body && typeof body.token === 'string'
    ? body.token.trim()
    : ''
  if (!token || token.length > 500) {
    return NextResponse.json({ error: 'Enter a valid GitHub personal access token.' }, { status: 400 })
  }

  try {
    const user = await github('/user', token)
    const cookieStore = await cookies()
    cookieStore.set('github_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })
    return NextResponse.json({ user })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to validate the GitHub token.',
      code: 'GITHUB_TOKEN_INVALID',
    }, { status: error instanceof GitHubApiError ? error.status : 502 })
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.set('github_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return NextResponse.json({ ok: true })
}
