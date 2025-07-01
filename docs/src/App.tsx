import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import DocumentPage from './components/DocumentPage'
import './App.css'

function App() {
    return (
        <Router>
            <div className="app">
                <header className="header">
                    <div className="header-content">
                        <div className="header-main">
                            <img
                                src="./kodrdriv-logo.svg"
                                alt="KodrDriv Logo"
                                width="64"
                                height="64"
                                style={{ filter: 'invert(1)' }}
                            />
                            <h1>KodrDriv</h1>
                        </div>
                        <p className="subtitle">Intelligent Git Release Notes & Change Logs</p>
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

                <main className="main">
                    <div className="container">
                        <Routes>
                            <Route path="/*" element={<DocumentPage />} />
                        </Routes>
                    </div>
                </main>

                <footer className="footer">
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
        </Router>
    )
}

export default App 