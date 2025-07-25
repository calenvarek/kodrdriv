import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import DocumentPage from './components/DocumentPage'
import StoryPage from './components/StoryPage'
import './App.css'

function App() {
    return (
        <Router basename="/kodrdriv">
            <div className="app">
                <Routes>
                    <Route path="/story" element={<StoryPage />} />
                    <Route path="/*" element={<LandingPage />} />
                </Routes>
            </div>
        </Router>
    )
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
                        <a href="./story" className="nav-link-story">Story</a>
                        <a href="./installation" className="nav-link-docs">Docs</a>
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
                    <div className="hero-badge">
                        <span>AI-Powered Git Automation</span>
                    </div>
                    <h1 className="hero-title">
                        Automate massively complex<br />
                        <span className="gradient-text">Git workflows</span>
                    </h1>
                    <p className="hero-description">
                        KodrDriv is a scientific-grade tool that leverages advanced AI to automatically generate
                        intelligent commit messages, comprehensive release notes, and orchestrate complex Git workflows
                        with the precision scientists demand.
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
                                    <span className="prompt">$</span> git add . && kodrdriv commit
                                </div>
                                <div className="terminal-line output">
                                    <span className="ai-indicator">🤖</span> Analyzing code changes...
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
                            <h3>Scientific Precision</h3>
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
                            <h3>Monorepo Ready</h3>
                            <p>Built-in workspace dependency management and cross-package linking for complex project architectures.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Workflow Section */}
            <section id="workflow" className="workflow">
                <div className="section-content">
                    <div className="section-header">
                        <h2>How scientists automate Git</h2>
                        <p>From chaos to clarity in three steps</p>
                    </div>

                    <div className="workflow-steps">
                        <div className="workflow-step">
                            <div className="step-number">01</div>
                            <div className="step-content">
                                <h3>Code & Commit</h3>
                                <p>Write code, stage changes, and let KodrDriv analyze your work to generate intelligent commit messages.</p>
                                <div className="code-example">
                                    <code>git add . && kodrdriv commit</code>
                                </div>
                            </div>
                        </div>

                        <div className="workflow-step">
                            <div className="step-number">02</div>
                            <div className="step-content">
                                <h3>Review & Release</h3>
                                <p>Generate comprehensive release notes and manage complex workflows with advanced Git automation.</p>
                                <div className="code-example">
                                    <code>kodrdriv review && kodrdriv release</code>
                                </div>
                            </div>
                        </div>

                        <div className="workflow-step">
                            <div className="step-number">03</div>
                            <div className="step-content">
                                <h3>Publish & Orchestrate</h3>
                                <p>Automate publishing workflows, manage dependencies, and maintain project documentation effortlessly.</p>
                                <div className="code-example">
                                    <code>kodrdriv publish --tree</code>
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
                            <h2>Start automating in 30 seconds</h2>
                            <p>Install globally and configure for your workflow</p>
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
                                <a href="./installation" className="btn-primary">Full Installation Guide</a>
                                <a href="./commands" className="btn-secondary">View Commands</a>
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
                                <a href="./installation">Installation</a>
                                <a href="./commands">Commands</a>
                                <a href="./configuration">Configuration</a>
                                <a href="./examples">Examples</a>
                            </div>
                            <div className="footer-section">
                                <h4>Resources</h4>
                                <a href="https://github.com/calenvarek/kodrdriv" target="_blank" rel="noopener noreferrer">GitHub</a>
                                <a href="https://www.npmjs.com/package/@eldrforge/kodrdriv" target="_blank" rel="noopener noreferrer">NPM</a>
                                <a href="./advanced-usage">Advanced Usage</a>
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
