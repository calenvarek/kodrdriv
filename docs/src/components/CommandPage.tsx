import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navigation from './Navigation'
import MarkdownRenderer from './MarkdownRenderer'
import LoadingSpinner from './LoadingSpinner'
import ErrorMessage from './ErrorMessage'
import './CommandPage.css'

function CommandPage() {
    const { command } = useParams<{ command: string }>()
    const [content, setContent] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const validCommands = [
        'commit', 'audio-commit', 'audio-review', 'select-audio',
        'link', 'review', 'release', 'publish', 'unlink', 'clean', 'tree', 'tree-built-in-commands'
    ]

    useEffect(() => {
        const loadCommandContent = async () => {
            if (!command || !validCommands.includes(command)) {
                setError(`Command "${command}" not found. Please check the command name.`)
                setLoading(false)
                return
            }

            try {
                setLoading(true)
                setError(null)

                // Try to load the specific command markdown file
                const response = await fetch(`../commands/${command}.md`)

                if (!response.ok) {
                    throw new Error(`Failed to load documentation for ${command}`)
                }

                const text = await response.text()
                setContent(text)
            } catch (err) {
                console.error('Error loading command documentation:', err)
                setError(`Failed to load documentation for "${command}". The documentation may not be available yet.`)
            } finally {
                setLoading(false)
            }
        }

        loadCommandContent()
    }, [command])

    if (loading) {
        return (
            <div className="documentation-layout">
                <header className="doc-header">
                    <div className="doc-header-content">
                        <div className="logo-section">
                            <a href="/kodrdriv/" className="logo-link">
                                <img
                                    src="/kodrdriv/kodrdriv-logo.svg"
                                    alt="KodrDriv Logo"
                                    width="40"
                                    height="40"
                                    className="doc-logo"
                                />
                                <h1>KodrDriv</h1>
                            </a>
                        </div>
                        <div className="header-links">
                            <a href="https://github.com/grunnverk/kodrdriv" target="_blank" rel="noopener noreferrer">
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
                        <LoadingSpinner />
                    </div>
                </main>
            </div>
        )
    }

    if (error) {
        return (
            <div className="documentation-layout">
                <header className="doc-header">
                    <div className="doc-header-content">
                        <div className="logo-section">
                            <a href="/kodrdriv/" className="logo-link">
                                <img
                                    src="/kodrdriv/kodrdriv-logo.svg"
                                    alt="KodrDriv Logo"
                                    width="40"
                                    height="40"
                                    className="doc-logo"
                                />
                                <h1>KodrDriv</h1>
                            </a>
                        </div>
                        <div className="header-links">
                            <a href="https://github.com/grunnverk/kodrdriv" target="_blank" rel="noopener noreferrer">
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
                        <div className="command-page-error">
                            <ErrorMessage message={error} />
                            <div className="error-actions">
                                <Link to="/commands" className="btn-secondary">
                                    ← Back to Commands
                                </Link>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="documentation-layout">
            <header className="doc-header">
                <div className="doc-header-content">
                    <div className="logo-section">
                        <a href="/kodrdriv/" className="logo-link">
                            <img
                                src="/kodrdriv/kodrdriv-logo.svg"
                                alt="KodrDriv Logo"
                                width="40"
                                height="40"
                                className="doc-logo"
                            />
                            <h1>KodrDriv</h1>
                        </a>
                    </div>
                    <div className="header-links">
                        <a href="https://github.com/grunnverk/kodrdriv" target="_blank" rel="noopener noreferrer">
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
                    <div className="command-page">
                        <div className="command-breadcrumb">
                            <Link to="/commands" className="breadcrumb-link">Commands</Link>
                            <span className="breadcrumb-separator">›</span>
                            <span className="breadcrumb-current">{command}</span>
                        </div>

                        <div className="command-content">
                            <MarkdownRenderer content={content} />
                        </div>

                        <div className="command-navigation">
                            <Link to="/commands" className="btn-secondary">
                                ← Back to Commands
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
            <footer className="doc-footer">
                <div className="container">
                    <p>
                        Built with ❤️ by{' '}
                        <a href="https://github.com/grunnverk" target="_blank" rel="noopener noreferrer">
                            Tim O'Brien
                        </a>
                    </p>
                    <p className="license">Licensed under Apache-2.0</p>
                </div>
            </footer>
        </div>
    )
}

export default CommandPage
