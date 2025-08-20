import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Navigation from './components/Navigation'
import DocumentPage from './components/DocumentPage'
import StoryPage from './components/StoryPage'
import CommandsPage from './components/CommandsPage'
import CommandPage from './components/CommandPage'
import './App.css'

function App() {
    return (
        <Router basename="/kodrdriv">
            <div className="app">
                <GitHubPagesRedirectHandler />
                <Routes>
                    <Route path="/story" element={<StoryPage />} />
                    <Route path="/commands" element={<CommandsPage />} />
                    <Route path="/commands/:command" element={<CommandPage />} />
                    <Route path="/*" element={<LandingPage />} />
                </Routes>
            </div>
        </Router>
    )
}

function GitHubPagesRedirectHandler() {
    const navigate = useNavigate()
    const location = useLocation()

    useEffect(() => {
        // Check if this is a redirect from the 404 page
        const urlParams = new URLSearchParams(location.search)
        const redirectPath = urlParams.get('p')

        if (redirectPath && redirectPath !== '/') {
            // Remove the redirect parameter and navigate to the intended path
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('p')
            window.history.replaceState({}, '', newUrl.pathname + newUrl.search + newUrl.hash)

            // Navigate to the intended path (only if it's not the home page to prevent loops)
            navigate(redirectPath, { replace: true })
        } else if (redirectPath === '/') {
            // If redirecting to home, just clean up the URL without navigating
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('p')
            window.history.replaceState({}, '', newUrl.pathname + newUrl.search + newUrl.hash)
        }
    }, [navigate, location])

    return null
}

function LandingPage() {
    const currentPath = window.location.pathname.replace('/kodrdriv', '') || '/'

    // If it's the story page, render the StoryPage component
    if (currentPath === '/story') {
        return <StoryPage />
    }

    // If it's any other documentation page, render documentation layout
    if (currentPath !== '/') {
        return (
            <div className="documentation-layout">
                <header className="doc-header">
                    <div className="doc-header-content">
                        <div className="logo-section">
                            <img
                                src="./kodrdriv-logo.svg"
                                alt="KodrDriv Logo"
                                width="40"
                                height="40"
                                className="doc-logo"
                            />
                            <h1>KodrDriv</h1>
                        </div>
                        <div className="header-links">
                            <a href="https://github.com/calenvarek/kodrdriv" target="_blank" rel="noopener noreferrer">
                                GitHub
                            </a>
                            <a href="https://www.npmjs.com/package/@eldrforge/kodrdriv" target="_blank" rel="noopener noreferrer">
                                NPM
                            </a>
                        </div>
                    </div>
                </header>
                <Navigation />
                <main className="doc-main">
                    <div className="doc-container">
                        <DocumentPage />
                    </div>
                </main>
                <footer className="doc-footer">
                    <div className="container">
                        <p>
                            Built with ❤️ by{' '}
                            <a href="https://github.com/calenvarek" target="_blank" rel="noopener noreferrer">
                                Calen Varek
                            </a>
                        </p>
                        <p className="license">Licensed under Apache-2.0</p>
                    </div>
                </footer>
            </div>
        )
    }

    return (
        <div className="landing-page">
            {/* Navigation */}
            <nav className="landing-nav">
                <div className="nav-content">
                    <div className="logo-section">
                        <img
                            src="./kodrdriv-logo.svg"
                            alt="KodrDriv Logo"
                            width="32"
                            height="32"
                            className="nav-logo"
                        />
                        <span className="nav-title">KodrDriv</span>
                    </div>
                    <div className="nav-links">
                        <a href="#features">Features</a>
                        <a href="#workflow">Workflow</a>
                        <a href="#installation">Install</a>
                        <a href="/kodrdriv/story" className="nav-link-story">Story</a>
                        <a href="/kodrdriv/commands/" className="nav-link-docs">Docs</a>
                        <a href="https://github.com/calenvarek/kodrdriv" target="_blank" rel="noopener noreferrer" className="nav-link-github">GitHub</a>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="hero">
                <div className="hero-background">
                    <div className="grid-pattern"></div>
                    <div className="gradient-overlay"></div>
                </div>
                <div className="hero-content">
                    <h1 className="hero-title">
                        Automate<br />
                        <span className="gradient-text">Git workflows</span>
                    </h1>
                    <p className="hero-description">
                        KodrDriv is a professional-grade tool designed specifically for npm projects that leverages advanced AI to automatically generate
                        intelligent commit messages, comprehensive release notes, and orchestrate complex Git workflows
                        with enterprise-level precision. Built for collections of interconnected projects without requiring complicated workspace management approaches.
                    </p>
                    <div className="hero-actions">
                        <button className="btn-primary" onClick={() => document.getElementById('installation')?.scrollIntoView({ behavior: 'smooth' })}>
                            Get Started
                        </button>
                        <button className="btn-secondary" onClick={() => window.location.href = './story'}>
                            Read the Story
                        </button>
                    </div>
                    <div className="hero-demo">
                        <div className="terminal-window">
                            <div className="terminal-header">
                                <div className="terminal-controls">
                                    <span className="control red"></span>
                                    <span className="control yellow"></span>
                                    <span className="control green"></span>
                                </div>
                                <span className="terminal-title">Terminal</span>
                            </div>
                            <div className="terminal-content">
                                <div className="terminal-line">
                                    <span className="prompt">$</span> git status
                                </div>
                                <div className="terminal-line output">
                                    Modified: src/auth/oauth.ts, src/auth/jwt.ts
                                </div>
                                <div className="terminal-line">
                                    <span className="prompt">$</span> git add src/auth/ && kodrdriv commit --cached
                                </div>
                                <div className="terminal-line output">
                                    <span className="ai-indicator">🤖</span> Analyzing staged changes...
                                </div>
                                <div className="terminal-line output">
                                    <span className="success">✓</span> Generated intelligent commit message
                                </div>
                                <div className="terminal-line output commit-msg">
                                    feat(auth): implement OAuth2 flow with JWT validation
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="features">
                <div className="section-content">
                    <div className="section-header">
                        <h2>Precision-engineered for developers</h2>
                        <p>Stop context-switching between code and documentation. Let AI handle the complexity.</p>
                    </div>

                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon">🧠</div>
                            <h3>Intelligent Analysis</h3>
                            <p>Advanced AI analyzes your code changes, commit history, and pull requests to generate contextually accurate documentation.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">⚡</div>
                            <h3>Workflow Automation</h3>
                            <p>Automate complex Git workflows including commit generation, release notes, PR management, and dependency linking.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">🎯</div>
                            <h3>Professional Precision</h3>
                            <p>Built for teams that demand accuracy. Every generated message is contextual, meaningful, and professionally structured.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">🔄</div>
                            <h3>Audio-Driven Development</h3>
                            <p>Record voice notes while coding. KodrDriv transforms your thoughts into structured commits and documentation.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">📊</div>
                            <h3>Release Orchestration</h3>
                            <p>Comprehensive release management with automatic changelog generation, version bumping, and GitHub integration.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon">🏗️</div>
                            <h3>Multi-Project Ready</h3>
                            <p>Manage collections of interconnected npm projects without complex workspace management. Simple dependency linking and cross-project workflows.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Workflow Section */}
            <section id="workflow" className="workflow">
                <div className="section-content">
                    <div className="section-header">
                        <h2>How npm developers automate Git</h2>
                        <p>From chaos to clarity in three steps</p>
                    </div>

                    <div className="workflow-steps">
                        <div className="workflow-step">
                            <div className="step-number">01</div>
                            <div className="step-content">
                                <h3>Code & Commit</h3>
                                <p>Code for hours, then check your status and choose your commit strategy. KodrDriv analyzes your changes and generates intelligent commits.</p>
                                <div className="code-examples">
                                    <div className="code-example-item">
                                        <div className="code-label">Quick commit all changes:</div>
                                        <div className="command-sequence">
                                            <code className="command-box">git status</code>
                                            <span className="arrow">→</span>
                                            <code className="command-box">git add -A</code>
                                            <span className="arrow">→</span>
                                            <code className="command-box">kodrdriv commit --cached --sendit</code>
                                        </div>
                                        <div className="command-links">
                                            <a href="/kodrdriv/commands/commit" className="command-link">📖 commit docs</a>
                                        </div>
                                    </div>
                                    <div className="code-example-item">
                                        <div className="code-label">Selective staging:</div>
                                        <div className="command-sequence">
                                            <code className="command-box">git add specific/files</code>
                                            <span className="arrow">→</span>
                                            <code className="command-box">kodrdriv commit --cached</code>
                                        </div>
                                        <div className="command-links">
                                            <a href="/kodrdriv/commands/commit" className="command-link">📖 commit docs</a>
                                        </div>
                                    </div>
                                </div>
                                <div className="config-note">
                                    <small>💡 Git workflow automation | ⚙️ <a href="/kodrdriv/configuration">Configuration required</a> | 📖 <a href="/kodrdriv/commands">All commands</a></small>
                                </div>
                            </div>
                        </div>

                        <div className="workflow-step">
                            <div className="step-number">02</div>
                            <div className="step-content">
                                <h3>Release & Publish</h3>
                                <p>Generate release notes, automate npm publishing, and manage multi-project dependencies. Designed for npm publishing workflows.</p>
                                <div className="code-examples">
                                    <div className="code-example-item">
                                        <div className="code-label">Manual release notes:</div>
                                        <div className="command-sequence">
                                            <code className="command-box">kodrdriv release 'focused on safety improvements'</code>
                                        </div>
                                        <div className="command-links">
                                            <a href="/kodrdriv/commands/release" className="command-link">📖 release docs</a>
                                        </div>
                                    </div>
                                    <div className="code-example-item">
                                        <div className="code-label">Automated branch publishing:</div>
                                        <div className="command-sequence">
                                            <code className="command-box">kodrdriv publish</code>
                                        </div>
                                        <div className="command-links">
                                            <a href="/kodrdriv/commands/publish" className="command-link">📖 publish docs</a>
                                        </div>
                                    </div>
                                    <div className="code-example-item">
                                        <div className="code-label">Multi-project publishing:</div>
                                        <div className="command-sequence">
                                            <code className="command-box">kodrdriv tree publish</code>
                                        </div>
                                        <div className="command-links">
                                            <a href="/kodrdriv/commands/tree-built-in-commands" className="command-link">📖 tree publish docs</a>
                                        </div>
                                    </div>
                                </div>
                                <div className="config-note">
                                    <small>📦 NPM publishing workflows | ⚙️ <a href="/kodrdriv/configuration">Configuration required</a> | 📖 <a href="/kodrdriv/commands">All commands</a></small>
                                </div>
                            </div>
                        </div>

                        <div className="workflow-step">
                            <div className="step-number">03</div>
                            <div className="step-content">
                                <h3>Review & Manage</h3>
                                <p>Generate issues from feedback, process audio recordings, and manage project reviews. Ideal for collecting ideas and converting them into actionable tasks.</p>
                                <div className="code-examples">
                                    <div className="code-example-item">
                                        <div className="code-label">Process recorded audio files:</div>
                                        <div className="command-sequence">
                                            <code className="command-box">kodrdriv audio-review path/to/audio/files</code>
                                        </div>
                                        <div className="command-links">
                                            <a href="/kodrdriv/commands/audio-review" className="command-link">📖 audio-review docs</a>
                                        </div>
                                    </div>
                                    <div className="code-example-item">
                                        <div className="code-label">Text-based review with editor:</div>
                                        <div className="command-sequence">
                                            <code className="command-box">kodrdriv review</code>
                                            <span className="arrow">→</span>
                                            <code className="command-box">[type feedback in editor]</code>
                                        </div>
                                        <div className="command-links">
                                            <a href="/kodrdriv/commands/review" className="command-link">📖 review docs</a>
                                        </div>
                                    </div>
                                    <div className="code-example-item">
                                        <div className="code-label">Live audio recording:</div>
                                        <div className="command-sequence">
                                            <code className="command-box">kodrdriv select-audio</code>
                                            <span className="arrow">→</span>
                                            <code className="command-box">kodrdriv audio-review</code>
                                        </div>
                                        <div className="command-links">
                                                                        <a href="/kodrdriv/commands/select-audio" className="command-link">📖 select-audio docs</a>
                            <a href="/kodrdriv/commands/audio-review" className="command-link">📖 audio-review docs</a>
                                        </div>
                                    </div>
                                </div>
                                <div className="config-note">
                                    <small>🎙️ Audio & feedback processing | ⚙️ <a href="/kodrdriv/configuration">Configuration required</a> | 📖 <a href="/kodrdriv/commands">All commands</a></small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Installation Section */}
            <section id="installation" className="installation">
                <div className="section-content">
                    <div className="installation-content">
                        <div className="installation-text">
                            <h2>Start automating npm workflows in 30 seconds</h2>
                            <p>Install globally and configure for your npm project workflow</p>
                            <div className="install-steps">
                                <div className="install-step">
                                    <span className="step-num">1</span>
                                    <span>Install globally via npm</span>
                                </div>
                                <div className="install-step">
                                    <span className="step-num">2</span>
                                    <span>Initialize configuration</span>
                                </div>
                                <div className="install-step">
                                    <span className="step-num">3</span>
                                    <span>Start automating</span>
                                </div>
                            </div>
                            <div className="cta-buttons">
                                                        <a href="/kodrdriv/installation" className="btn-primary">Full Installation Guide</a>
                        <a href="/kodrdriv/commands" className="btn-secondary">View Commands</a>
                            </div>
                        </div>
                        <div className="installation-demo">
                            <div className="terminal-window">
                                <div className="terminal-header">
                                    <div className="terminal-controls">
                                        <span className="control red"></span>
                                        <span className="control yellow"></span>
                                        <span className="control green"></span>
                                    </div>
                                    <span className="terminal-title">Installation</span>
                                </div>
                                <div className="terminal-content">
                                    <div className="terminal-line">
                                        <span className="prompt">$</span> npm install -g @eldrforge/kodrdriv
                                    </div>
                                    <div className="terminal-line">
                                        <span className="prompt">$</span> kodrdriv --init-config
                                    </div>
                                    <div className="terminal-line output">
                                        <span className="success">✓</span> Configuration initialized
                                    </div>
                                    <div className="terminal-line">
                                        <span className="prompt">$</span> kodrdriv commit
                                    </div>
                                    <div className="terminal-line output">
                                        <span className="ai-indicator">🤖</span> Ready to automate your workflow!
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="landing-footer">
                <div className="footer-content">
                    <div className="footer-main">
                        <div className="footer-brand">
                            <img
                                src="./kodrdriv-logo.svg"
                                alt="KodrDriv Logo"
                                width="32"
                                height="32"
                                className="footer-logo"
                            />
                            <span>KodrDriv</span>
                        </div>
                        <div className="footer-links">
                            <div className="footer-section">
                                <h4>Product</h4>
                                <a href="/kodrdriv/installation">Installation</a>
                                <a href="/kodrdriv/commands">Commands</a>
                                <a href="/kodrdriv/configuration">Configuration</a>
                                <a href="/kodrdriv/examples">Examples</a>
                            </div>
                            <div className="footer-section">
                                <h4>Resources</h4>
                                <a href="https://github.com/calenvarek/kodrdriv" target="_blank" rel="noopener noreferrer">GitHub</a>
                                <a href="https://www.npmjs.com/package/@eldrforge/kodrdriv" target="_blank" rel="noopener noreferrer">NPM</a>
                                <a href="/kodrdriv/customization">Customization</a>
                            </div>
                        </div>
                    </div>
                    <div className="footer-bottom">
                        <p>
                            Built with ❤️ by{' '}
                            <a href="https://github.com/calenvarek" target="_blank" rel="noopener noreferrer">
                                Calen Varek
                            </a>
                        </p>
                        <p className="license">Licensed under Apache-2.0</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default App
