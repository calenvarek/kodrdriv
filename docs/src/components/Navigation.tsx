import { Link, useLocation } from 'react-router-dom'
import './Navigation.css'

const navigationItems = [
    { path: '/', label: 'Getting Started', file: 'README.md' },
    { path: '/commands', label: 'Commands', file: 'commands.md' },
    { path: '/configuration', label: 'Configuration', file: 'configuration.md' },
    { path: '/advanced-usage', label: 'Advanced Usage', file: 'advanced-usage.md' },
    { path: '/examples', label: 'Examples', file: 'examples.md' },
]

function Navigation() {
    const location = useLocation()

    return (
        <nav className="navigation">
            <div className="nav-container">
                <ul className="nav-list">
                    {navigationItems.map((item) => (
                        <li key={item.path} className="nav-item">
                            <Link
                                to={item.path}
                                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                            >
                                {item.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </nav>
    )
}

export default Navigation
export { navigationItems } 