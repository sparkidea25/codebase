'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity, ArrowDownUp, ArrowRight, Bell, BookMarked, Box, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleDot, Clock3, Code2, Command, ExternalLink,
  GitBranch, GitCommitHorizontal, GitFork, GitPullRequest, Grid2X2, List,
  Menu, MoreHorizontal, Plus, Search, Settings2, SlidersHorizontal, Star,
  X,
} from 'lucide-react'

type Repo = {
  id: number; name: string; full_name: string; description: string | null; language: string | null
  stargazers_count: number; forks_count: number; updated_at: string; private: boolean; html_url: string
}
type Event = { id: string; type: string; repo: { name: string }; created_at: string; payload?: { commits?: { message: string }[] } }
type Issue = { number: number; title: string; html_url: string; repository_url: string; updated_at: string; user: { login: string }; labels: { name: string; color: string }[]; pull_request?: unknown }
type Dashboard = { error?: string; code?: string; user: { login: string; name: string | null; avatar_url: string; bio: string | null; followers: number; following: number; public_repos: number }; repos: Repo[]; starredCount: number; events: Event[]; issueCount: number; pullCount: number; contributions: { totalContributions: number; weeks: { contributionDays: { contributionCount: number; date: string }[] }[] } | null; warnings?: string[] }

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new ApiRequestError(data.error ?? 'Unable to load GitHub data.', response.status, data.code)
  return data
}
class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}
const navItems = [
  { label: 'Overview', icon: Box }, { label: 'Repositories', icon: Code2 }, { label: 'Pull requests', icon: GitPullRequest },
  { label: 'Issues', icon: CircleDot }, { label: 'Activity', icon: Activity }, { label: 'Starred', icon: Star },
]
const languageColors: Record<string, string> = { TypeScript: '#4d9de0', JavaScript: '#f0db4f', Python: '#3572a5', Rust: '#dea584', Go: '#00add8', CSS: '#563d7c', Swift: '#f05138', HTML: '#e34c26' }
const timeAgo = (value: string) => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}
const getGreeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function ContributionChart({ contributions }: { contributions: Dashboard['contributions'] }) {
  const days = contributions?.weeks.flatMap((week) => week.contributionDays) ?? []
  const max = Math.max(1, ...days.map((day) => day.contributionCount))
  return <div className="contrib-scroll"><div className="contrib-grid" role="img" aria-label={contributions ? `${contributions.totalContributions} contributions in the last year` : 'Contribution history unavailable'}>
    {days.map((day) => <span key={day.date} title={`${day.contributionCount} contributions on ${day.date}`} className="contrib-cell" data-level={day.contributionCount === 0 ? 0 : Math.min(4, Math.ceil(day.contributionCount / max * 4))} />)}
  </div></div>
}

function RepositoryCard({ repo }: { repo: Repo }) {
  return <a className="repo-card" href={repo.html_url} target="_blank" rel="noreferrer">
    <div className="repo-card-top"><span className="repo-icon"><Code2 size={15} /></span><span className="repo-name">{repo.name}</span><ExternalLink size={13} className="external-icon" /></div>
    <p className="repo-description">{repo.description || 'No description provided.'}</p>
    <div className="repo-meta"><span className="language"><i style={{ background: languageColors[repo.language ?? ''] ?? '#7d8590' }} />{repo.language || 'Other'}</span><span><Star size={13} />{repo.stargazers_count}</span><span><GitFork size={13} />{repo.forks_count}</span><span className="repo-updated">{timeAgo(repo.updated_at)}</span></div>
  </a>
}

function EventRow({ event }: { event: Event }) {
  const action = event.type.replace('Event', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase()
  return <div className="activity-row"><span className="activity-icon"><GitCommitHorizontal size={15} /></span><div className="activity-copy"><p><strong>{event.repo.name}</strong> <span>{action}</span></p><small>{event.payload?.commits?.[0]?.message ?? `${event.type.replace('Event', '')} activity`} · {timeAgo(event.created_at)}</small></div><ArrowRight size={14} className="activity-arrow" /></div>
}

export function CodebaseApp() {
  const [active, setActive] = useState('Overview')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sort, setSort] = useState('Recently updated')
  const [visibility, setVisibility] = useState<'All' | 'Public' | 'Private'>('All')
  const [greeting, setGreeting] = useState<string | null>(null)
  useEffect(() => {
    const updateGreeting = () => setGreeting(getGreeting())
    updateGreeting()
    const interval = window.setInterval(updateGreeting, 60_000)
    return () => window.clearInterval(interval)
  }, [])
  const { data: dashboard, error: dashboardError, isLoading: dashboardLoading, refetch: refreshDashboard } = useQuery<Dashboard>({ queryKey: ['github', 'overview'], queryFn: () => fetcher('/api/github'), retry: false })
  const sectionMap: Record<string, string> = { Repositories: 'repositories', Starred: 'starred', 'Pull requests': 'pulls', Issues: 'issues', Activity: 'activity' }
  const section = sectionMap[active]
  const { data: sectionData, error: sectionError, isLoading: sectionLoading } = useQuery({ queryKey: ['github', section, query], queryFn: () => fetcher(`/api/github?section=${section}&q=${encodeURIComponent(query)}`), enabled: Boolean(section), retry: false })
  const repositories = useMemo(() => {
    const source: Repo[] = section ? sectionData?.repos ?? [] : dashboard?.repos ?? []
    return [...source].filter((repo) => visibility === 'All' || (visibility === 'Private' ? repo.private : !repo.private)).sort((a, b) => sort === 'Name' ? a.name.localeCompare(b.name) : sort === 'Most stars' ? b.stargazers_count - a.stargazers_count : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [dashboard?.repos, section, sectionData?.repos, sort, visibility])
  const currentError = section ? sectionError : dashboardError
  const isLoading = section ? sectionLoading : dashboardLoading
  const activity = sectionData?.events ?? dashboard?.events ?? []

  if (dashboardLoading) {
    return <GitHubTokenGate checking onConnected={() => refreshDashboard()} />
  }
  if (dashboardError || !dashboard) {
    return <GitHubTokenGate initialError={dashboardError instanceof Error ? dashboardError.message : null} onConnected={() => refreshDashboard()} />
  }

  return <main className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-row"><div className="brand-mark"><Code2 size={17} strokeWidth={2.4} /></div><span className="brand-name">codebase</span><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={17} /></button><button className="workspace-switch"><span className="workspace-avatar">{dashboard?.user?.login?.[0]?.toUpperCase() ?? 'C'}</span><span className="workspace-copy"><b>{dashboard?.user?.login ?? 'Workspace'}</b><small>Personal account</small></span><ChevronDown size={14} /></button></div>
      <div className="sidebar-scroll">
        <button className="quick-search" onClick={() => { setActive('Repositories'); window.setTimeout(() => document.getElementById('global-search')?.focus(), 0) }}><Search size={15} /><span>Search repositories...</span><kbd>/</kbd></button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActive(label); setSidebarOpen(false) }} className={`nav-item ${active === label ? 'active' : ''}`}><Icon size={16} strokeWidth={1.8} /><span>{label}</span>{label === 'Pull requests' && dashboard?.pullCount ? <span className="nav-count">{dashboard.pullCount}</span> : null}</button>)}</nav>
        <div className="nav-section-heading"><span>YOUR ORGANIZATIONS</span><button aria-label="Create organization on GitHub" onClick={() => window.open('https://github.com/organizations/new', '_blank', 'noopener,noreferrer')}><Plus size={14} /></button></div>
        <div className="empty-org"><span className="org-icon">◈</span><span>No organizations yet</span></div>
        <div className="nav-section-heading projects-heading"><span>RECENT PROJECTS</span><button aria-label="Browse repositories" onClick={() => setActive('Repositories')}><Plus size={14} /></button></div>
        {dashboard?.repos?.slice(0, 4).map((repo) => <button className="project-link" key={repo.id} onClick={() => setActive('Repositories')}><span className="project-dot" style={{ background: languageColors[repo.language ?? ''] ?? '#77818c' }} />{repo.name}</button>)}
      </div>
      <div className="sidebar-bottom"><button className={`nav-item ${active === 'Settings' ? 'active' : ''}`} onClick={() => setActive('Settings')}><Settings2 size={16} /><span>Settings</span></button><div className="sidebar-user"><div className="user-avatar">{dashboard?.user?.avatar_url ? <img src={dashboard.user.avatar_url} alt="" /> : <span>C</span>}</div><div className="user-details"><b>{dashboard?.user?.name ?? dashboard?.user?.login ?? 'Connect GitHub'}</b><small>{dashboard?.user?.login ? `@${dashboard.user.login}` : 'Account not connected'}</small></div><MoreHorizontal size={17} /></div></div>
    </aside>
    {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <section className="main-panel">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={18} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><b>{active}</b></div><div className="topbar-actions"><button className="icon-button" aria-label="GitHub notifications" onClick={() => window.open('https://github.com/notifications', '_blank', 'noopener,noreferrer')}><Bell size={16} /></button><span className="topbar-divider" /><button className="help-link" onClick={() => setActive('Settings')}>Help & feedback</button><button className="topbar-avatar">{dashboard?.user?.login?.[0]?.toUpperCase() ?? 'C'}</button></div></header>
      <div className="content-area">
        {active === 'Settings' ? <SettingsView configured onDisconnected={() => refreshDashboard()} /> : <>
          <div className="page-heading"><div><div className="eyebrow">{active === 'Overview' ? 'YOUR DEVELOPMENT WORKSPACE' : 'WORKSPACE'}</div><h1>{active === 'Overview' ? `${greeting ?? 'Welcome'}${dashboard?.user?.name ? `, ${dashboard.user.name.split(' ')[0]}` : ''}` : active}</h1><p>{active === 'Overview' ? 'Here’s what’s happening across your codebase.' : active === 'Repositories' ? 'A home for all your projects, in one place.' : active === 'Pull requests' ? 'Review changes and keep your team moving.' : active === 'Issues' ? 'Track the work that matters.' : active === 'Starred' ? 'Repositories you’ve saved for later.' : 'A live pulse of your work on GitHub.'}</p></div><div className="heading-actions"><button className="outline-button" onClick={() => void refreshDashboard()}><Activity size={15} />Refresh</button><button className="primary-button" onClick={() => window.open('https://github.com/new', '_blank', 'noopener,noreferrer')}><Plus size={15} />New repository</button></div></div>
          {currentError ? <div className="connection-banner"><div className="connection-symbol"><GitBranch size={18} /></div><div className="connection-copy"><strong>{currentError.message.includes('GITHUB_NOT_CONFIGURED') ? 'Connect your GitHub account' : 'Could not load GitHub data'}</strong><p>{currentError.message}</p></div><button onClick={() => setActive('Settings')} className="connection-link">Configure connection <ArrowRight size={14} /></button></div> : null}
          {!currentError && dashboard?.warnings?.length ? <div className="connection-banner" role="status"><div className="connection-symbol"><Activity size={18} /></div><div className="connection-copy"><strong>Some GitHub data is unavailable</strong><p>{dashboard.warnings.join(' ')}</p></div></div> : null}
          {active === 'Overview' && <>
            <div className="stats-grid"><StatCard label="Repositories" value={dashboard?.repos?.length} icon={<Code2 size={16} />} detail="Across all your workspaces" loading={isLoading} /><StatCard label="Open pull requests" value={dashboard?.pullCount} icon={<GitPullRequest size={16} />} detail="Authored by you" loading={isLoading} /><StatCard label="Assigned issues" value={dashboard?.issueCount} icon={<CircleDot size={16} />} detail="Currently open" loading={isLoading} /><StatCard label="Stars received" value={dashboard?.repos?.reduce((sum, repo) => sum + repo.stargazers_count, 0)} icon={<Star size={16} />} detail={`${dashboard?.starredCount ?? 0} repositories starred`} loading={isLoading} /></div>
            <section className="panel contribution-panel"><div className="panel-heading"><div><h2>Contribution activity</h2><p>{dashboard?.contributions ? `${dashboard.contributions.totalContributions.toLocaleString()} contributions in the last year` : 'Your coding activity over the last year'}</p></div><span className="select-button" aria-label="Contribution period">Last 12 months <ChevronDown size={14} /></span></div><ContributionChart contributions={dashboard?.contributions ?? null} /><div className="chart-foot"><span>Less</span><i className="contrib-cell" data-level="0"/><i className="contrib-cell" data-level="1"/><i className="contrib-cell" data-level="2"/><i className="contrib-cell" data-level="3"/><i className="contrib-cell" data-level="4"/><span>More</span></div></section>
            <div className="lower-grid"><section className="panel repos-panel"><div className="panel-heading"><div><h2>Recently updated</h2><p>Your latest repository activity</p></div><button className="text-button" onClick={() => setActive('Repositories')}>View all <ArrowRight size={14} /></button></div>{isLoading ? <LoadingRows /> : dashboard?.repos?.length ? <div className="recent-repos">{dashboard.repos.slice(0, 5).map((repo) => <RepositoryRow key={repo.id} repo={repo} />)}</div> : <EmptyState title="No repositories yet" text="Connect GitHub to see your projects here." />}</section><section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Your latest GitHub events</p></div><button className="icon-button small" aria-label="More activity"><MoreHorizontal size={17} /></button></div>{isLoading ? <LoadingRows /> : activity.length ? activity.slice(0, 5).map((event: Event) => <EventRow key={event.id} event={event} />) : <EmptyState title="Nothing to show yet" text="Your GitHub activity will appear here." />}</section></div>
          </>}
          {active === 'Repositories' || active === 'Starred' ? <section className="repo-browser"><div className="repo-toolbar"><label className="search-field"><Search size={15} /><input id="global-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter repositories..." /><kbd>/</kbd></label><button className="outline-button filter-button" onClick={() => setVisibility(visibility === 'All' ? 'Private' : visibility === 'Private' ? 'Public' : 'All')}><SlidersHorizontal size={15} />{visibility === 'All' ? 'Filters' : visibility}</button><button className="select-button sort-button" onClick={() => setSort(sort === 'Recently updated' ? 'Name' : sort === 'Name' ? 'Most stars' : 'Recently updated')}><ArrowDownUp size={14} />{sort}<ChevronDown size={13} /></button><span className="view-toggle"><button className={view === 'grid' ? 'selected' : ''} aria-label="Grid view" onClick={() => setView('grid')}><Grid2X2 size={15} /></button><button className={view === 'list' ? 'selected' : ''} aria-label="List view" onClick={() => setView('list')}><List size={16} /></button></span></div><div className="repo-results-label">{isLoading ? 'Loading repositories…' : `${repositories.length} ${repositories.length === 1 ? 'repository' : 'repositories'}`}</div>{currentError ? null : repositories.length ? <div className={view === 'grid' ? 'repo-grid' : 'repo-list'}>{repositories.map((repo) => view === 'grid' ? <RepositoryCard key={repo.id} repo={repo} /> : <RepositoryRow key={repo.id} repo={repo} />)}</div> : <EmptyState title={query ? 'No matching repositories' : 'No repositories found'} text={query ? 'Try another search term.' : 'Your GitHub repositories will appear here once connected.'} />}</section> : null}
          {active === 'Issues' || active === 'Pull requests' ? <IssuesView items={sectionData?.items ?? []} loading={isLoading} error={currentError} kind={active} query={query} setQuery={setQuery} /> : null}
          {active === 'Activity' ? <section className="panel full-activity"><div className="panel-heading"><div><h2>Latest events</h2><p>Activity from your GitHub account</p></div></div>{isLoading ? <LoadingRows /> : activity.length ? activity.map((event: Event) => <EventRow key={event.id} event={event} />) : <EmptyState title="No recent activity" text="Your GitHub events will show up here." />}</section> : null}
        </>}
        <footer className="page-footer"><span>Built for the way you build.</span><span><span className="status-dot" />All systems operational</span></footer>
      </div>
    </section>
  </main>
}

function GitHubTokenGate({ checking = false, initialError = '', onConnected }: { checking?: boolean; initialError?: string | null; onConnected: () => Promise<unknown> }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState(initialError ?? '')
  const [submitting, setSubmitting] = useState(false)

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to connect GitHub.')
      setToken('')
      await onConnected()
    } catch (reason) {
      setToken('')
      setError(reason instanceof Error ? reason.message : 'Unable to connect GitHub.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="connection-gate">
    <section className="connection-card">
      <div className="connection-brand"><span className="brand-mark"><Code2 size={17} /></span><span className="brand-name">codebase</span></div>
      <h1>Connect GitHub</h1>
      <p className="connection-intro">{checking ? 'Checking your GitHub connection…' : 'Enter a GitHub personal access token to unlock your workspace.'}</p>
      <form className="token-form" onSubmit={connect}>
        <label htmlFor="github-token">Personal access token</label>
        <input id="github-token" type="password" autoComplete="new-password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="ghp_… or github_pat_…" disabled={checking || submitting} required />
        <button className="primary-button" type="submit" disabled={checking || submitting || !token.trim()}>{checking ? 'Checking…' : submitting ? 'Validating…' : 'Connect GitHub'}</button>
      </form>
      {error ? <p className="token-error" role="alert">{error}</p> : null}
      <p className="token-security">The token is validated by GitHub and stored in an HttpOnly session cookie, inaccessible to page JavaScript and local storage.</p>
      <a className="token-help" href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Codebase" target="_blank" rel="noreferrer">Create a GitHub token <ExternalLink size={13} /></a>
    </section>
  </main>
}

function StatCard({ label, value, icon, detail, loading }: { label: string; value?: number; icon: ReactNode; detail: string; loading: boolean }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{loading ? <span className="skeleton-line" /> : value?.toLocaleString() ?? '—'}</div><div className="stat-detail">{detail}</div></div>
}
function RepositoryRow({ repo }: { repo: Repo }) {
  return <a className="repository-row" href={repo.html_url} target="_blank" rel="noreferrer"><span className="repo-row-icon"><Code2 size={15} /></span><div className="repo-row-main"><strong>{repo.full_name}</strong><span>{repo.description || 'No description provided.'}</span></div><span className="repo-privacy">{repo.private ? 'Private' : 'Public'}</span><span className="language"><i style={{ background: languageColors[repo.language ?? ''] ?? '#7d8590' }} />{repo.language || 'Other'}</span><span className="repo-row-stars"><Star size={13} />{repo.stargazers_count}</span><span className="repo-updated">{timeAgo(repo.updated_at)}</span></a>
}
function LoadingRows() { return <div className="loading-rows"><span /><span /><span /></div> }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span className="empty-state-icon"><BookMarked size={18} /></span><strong>{title}</strong><p>{text}</p></div> }
function IssuesView({ items, loading, error, kind, query, setQuery }: { items: Issue[]; loading: boolean; error?: Error | null; kind: string; query: string; setQuery: (value: string) => void }) {
  return <section className="panel issue-panel"><div className="repo-toolbar"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${kind.toLowerCase()}...`} /><kbd>/</kbd></label></div>{error ? null : loading ? <LoadingRows /> : items.length ? items.map((item) => <a key={item.number} className="issue-row" href={item.html_url} target="_blank" rel="noreferrer"><span className="issue-type"><CircleDot size={17} /></span><div className="issue-main"><strong>{item.title}</strong><small>#{item.number} · {item.repository_url.split('/').slice(-2).join('/')} · updated {timeAgo(item.updated_at)}</small></div><span className="issue-labels">{item.labels.slice(0, 2).map((label) => <span key={label.name} className="issue-label" style={{ borderColor: `#${label.color}88`, color: `#${label.color}` }}>{label.name}</span>)}</span></a>) : <EmptyState title={`No open ${kind.toLowerCase()}`} text={`When you have ${kind.toLowerCase()}, they’ll appear here.`} />}</section>
}
function SettingsView({ configured, onDisconnected }: { configured: boolean; onDisconnected: () => Promise<unknown> }) {
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')

  const disconnect = async () => {
    setDisconnecting(true)
    setError('')
    try {
      const response = await fetch('/api/github', { method: 'DELETE' })
      if (!response.ok) throw new Error('Unable to disconnect GitHub.')
      await onDisconnected()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to disconnect GitHub.')
    } finally {
      setDisconnecting(false)
    }
  }

  return <div className="settings-view"><div className="eyebrow">PREFERENCES</div><h1>Settings</h1><p className="settings-intro">Manage your workspace and connected accounts.</p><section className="panel settings-card"><div className="settings-card-heading"><div className="settings-provider"><span className="github-mark"><GitBranch size={19} /></span><div><h2>GitHub connection</h2><p>Connect your account to sync repositories, pull requests, issues, and activity.</p></div></div><span className={`connection-status ${configured ? 'connected' : ''}`}><i />{configured ? 'Connected' : 'Not connected'}</span></div><div className="settings-detail"><div><strong>Secure token storage</strong><p>Your token stays in an HttpOnly session cookie and is only sent to the server.</p></div><button className="outline-button" disabled={disconnecting} onClick={() => void disconnect()}>{disconnecting ? 'Disconnecting…' : 'Disconnect'}</button></div>{error ? <p className="token-error" role="alert">{error}</p> : null}<div className="setup-note"><strong>Token permissions</strong><p>Use a token with read access to your repositories and profile. If GitHub rejects it, the exact API error will be shown on the connection screen.</p></div></section><section className="panel settings-card"><div className="settings-provider"><span className="settings-gear"><Settings2 size={18} /></span><div><h2>Workspace preferences</h2><p>Personalize your Codebase experience.</p></div></div><div className="preference-row"><span>Theme</span><span className="preference-value">Dark <ChevronDown size={14} /></span></div><div className="preference-row"><span>Default repository view</span><span className="preference-value">Grid <ChevronDown size={14} /></span></div></section></div>
}
