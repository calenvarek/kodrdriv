import { useEffect, useState } from 'react'
import './StoryPage.css'

function StoryPage() {
    const [scrollY, setScrollY] = useState(0)
    const [currentChapter, setCurrentChapter] = useState(0)

        useEffect(() => {
        const handleScroll = () => {
            setScrollY(window.scrollY)

            // Calculate current chapter based on scroll position
            const windowHeight = window.innerHeight
            const chapter = Math.floor(window.scrollY / windowHeight)
            setCurrentChapter(Math.min(chapter, 5))

            // Add parallax effects to story sections
            const sections = document.querySelectorAll('.story-section')
            sections.forEach((section, index) => {
                const rect = section.getBoundingClientRect()
                const isVisible = rect.top < window.innerHeight && rect.bottom > 0

                if (isVisible) {
                    const parallaxSpeed = 0.5
                    const yPos = -(rect.top * parallaxSpeed)
                    const backgrounds = section.querySelectorAll('.background-layer > *')

                    backgrounds.forEach((bg, bgIndex) => {
                        const speed = parallaxSpeed * (bgIndex + 1) * 0.3
                        const element = bg as HTMLElement
                        element.style.transform = `translateY(${yPos * speed}px)`
                    })

                    // Add fade-in animation for content
                    const content = section.querySelector('.story-content-inner')
                    if (content && rect.top < window.innerHeight * 0.7) {
                        content.classList.add('visible')
                    }
                }
            })
        }

        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const chapters = [
        { id: 'prologue', title: 'The Learning Machine' },
        { id: 'discovery', title: 'First Contact' },
        { id: 'adaptation', title: 'Adaptation' },
        { id: 'acceleration', title: 'Acceleration' },
        { id: 'mastery', title: 'Mastery' },
        { id: 'future', title: 'The Future' }
    ]

    const scrollToChapter = (index: number) => {
        const element = document.getElementById(chapters[index].id)
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' })
        }
    }

    return (
        <div className="story-page">
            {/* Navigation */}
            <nav className="story-nav">
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
                        <a href="./">Home</a>
                        <a href="./installation">Docs</a>
                        <a href="https://github.com/calenvarek/kodrdriv" target="_blank" rel="noopener noreferrer">GitHub</a>
                    </div>
                </div>
            </nav>

            {/* Chapter Navigation */}
            <div className="chapter-nav">
                <div className="chapter-list">
                    {chapters.map((chapter, index) => (
                        <button
                            key={chapter.id}
                            className={`chapter-button ${currentChapter === index ? 'active' : ''}`}
                            onClick={() => scrollToChapter(index)}
                        >
                            <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
                            <span className="chapter-title">{chapter.title}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Story Content */}
            <main className="story-content">
                {/* Prologue - The Learning Machine */}
                <section id="prologue" className="story-section prologue">
                    <div className="background-layer">
                        <div className="neural-network" style={{ transform: `translateY(${scrollY * 0.5}px)` }}>
                            <div className="neural-nodes"></div>
                        </div>
                        <div className="code-rain" style={{ transform: `translateY(${scrollY * 0.3}px)` }}></div>
                    </div>
                    <div className="story-content-inner">
                        <div className="story-header">
                            <h1 className="story-title">The Learning Machine</h1>
                            <p className="story-subtitle">How KodrDriv transforms chaos into clarity</p>
                        </div>
                        <div className="story-text">
                            <p className="lead">
                                In the depths of Silicon Valley, where coffee flows like water and keyboards never sleep,
                                a developer named Alex faces the same nightmare that haunts thousands of engineers:
                                the dreaded commit message.
                            </p>
                            <p>
                                At 2:47 AM, after six hours of deep coding, the cursor blinks mockingly in the Git commit dialog.
                                "What did I even change?" Alex wonders, staring at the diff that spans 14 files and 200 lines.
                                The deadline looms. The team waits. The perfect commit message feels impossible.
                            </p>
                            <p>
                                This is where our story begins — and where everything changes.
                            </p>
                        </div>
                    </div>
                    <div className="scroll-indicator">
                        <div className="scroll-arrow"></div>
                        <span>Scroll to continue</span>
                    </div>
                </section>

                {/* Chapter 1 - First Contact */}
                <section id="discovery" className="story-section discovery">
                    <div className="background-layer">
                        <div className="terminal-visualization" style={{ transform: `translateY(${scrollY * 0.2}px)` }}>
                            <div className="floating-terminal">
                                <div className="terminal-header">
                                    <div className="terminal-controls">
                                        <span className="control red"></span>
                                        <span className="control yellow"></span>
                                        <span className="control green"></span>
                                    </div>
                                </div>
                                <div className="terminal-body">
                                    <div className="terminal-line">
                                        <span className="prompt">$</span> npm install -g @eldrforge/kodrdriv
                                    </div>
                                    <div className="terminal-line output">
                                        <span className="success">✓</span> KodrDriv installed successfully
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="story-content-inner">
                        <h2 className="chapter-title">First Contact</h2>
                        <div className="story-text">
                            <p>
                                The installation was simple. One command, thirty seconds, and KodrDriv became part of Alex's toolkit.
                                But this wasn't just another CLI tool — it was the beginning of a relationship.
                            </p>
                            <p>
                                The first `kodrdriv commit` felt like magic. The AI analyzed the changes, understood the context,
                                and generated: <code className="inline-code">feat(auth): implement OAuth2 flow with JWT validation</code>
                            </p>
                            <p>
                                "That's... exactly what I would have written," Alex whispered, "if I had the time to think clearly."
                            </p>
                        </div>

                        <div className="insight-box">
                            <div className="insight-icon">🧠</div>
                            <div className="insight-content">
                                <h3>The Learning Begins</h3>
                                <p>KodrDriv didn't just analyze the code — it began studying Alex's patterns, preferences, and style.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Chapter 2 - Adaptation */}
                <section id="adaptation" className="story-section adaptation">
                    <div className="background-layer">
                        <div className="data-visualization" style={{ transform: `translateY(${scrollY * 0.1}px)` }}>
                            <div className="data-streams"></div>
                            <div className="pattern-recognition"></div>
                        </div>
                    </div>
                    <div className="story-content-inner">
                        <h2 className="chapter-title">Adaptation</h2>
                        <div className="story-text">
                            <p>
                                Week by week, commit by commit, KodrDriv learned. It noticed Alex preferred present tense
                                over past tense. It understood the team's convention of using specific prefixes for different
                                types of changes. It recognized patterns in how Alex structured messages for the
                                microservices architecture.
                            </p>
                            <p>
                                When Alex worked on the authentication service, KodrDriv suggested security-focused commit messages.
                                When touching the API gateway, it emphasized performance and routing changes.
                                When refactoring tests, it highlighted coverage improvements and test clarity.
                            </p>
                        </div>

                        <div className="metrics-display">
                            <div className="metric">
                                <div className="metric-value">127</div>
                                <div className="metric-label">Commits Analyzed</div>
                            </div>
                            <div className="metric">
                                <div className="metric-value">94%</div>
                                <div className="metric-label">Accuracy Rate</div>
                            </div>
                            <div className="metric">
                                <div className="metric-value">3.2s</div>
                                <div className="metric-label">Avg. Generation Time</div>
                            </div>
                        </div>

                        <div className="story-text">
                            <p>
                                But KodrDriv wasn't just memorizing — it was understanding. It learned that Alex's late-night
                                commits needed extra context. It recognized when changes were part of larger feature branches
                                and adjusted the messaging accordingly.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Chapter 3 - Acceleration */}
                <section id="acceleration" className="story-section acceleration">
                    <div className="background-layer">
                        <div className="workflow-visualization" style={{ transform: `translateY(${scrollY * 0.15}px)` }}>
                            <div className="workflow-nodes"></div>
                            <div className="automation-lines"></div>
                        </div>
                    </div>
                    <div className="story-content-inner">
                        <h2 className="chapter-title">Acceleration</h2>
                        <div className="story-text">
                            <p>
                                The transformation wasn't just about commit messages. KodrDriv began orchestrating Alex's entire
                                workflow. Release notes generated automatically. Pull request descriptions that actually told a story.
                                Dependency updates that understood the impact across the monorepo.
                            </p>
                            <p>
                                "I used to spend Friday afternoons writing release notes," Alex told a colleague.
                                "Now KodrDriv generates them in seconds, and they're better than what I used to write."
                            </p>
                        </div>

                        <div className="workflow-showcase">
                            <div className="workflow-step">
                                <div className="step-icon">💻</div>
                                <div className="step-content">
                                    <h4>Code Changes</h4>
                                    <p>Alex focuses on solving problems, not documentation</p>
                                </div>
                            </div>
                            <div className="workflow-arrow">→</div>
                            <div className="workflow-step">
                                <div className="step-icon">🤖</div>
                                <div className="step-content">
                                    <h4>AI Analysis</h4>
                                    <p>KodrDriv understands context, patterns, and preferences</p>
                                </div>
                            </div>
                            <div className="workflow-arrow">→</div>
                            <div className="workflow-step">
                                <div className="step-icon">📋</div>
                                <div className="step-content">
                                    <h4>Perfect Documentation</h4>
                                    <p>Commits, releases, and reviews generated automatically</p>
                                </div>
                            </div>
                        </div>

                        <div className="story-text">
                            <p>
                                The audio feature changed everything. Instead of stopping to write commit messages,
                                Alex could simply speak thoughts while coding: "Adding rate limiting to the API endpoint
                                to prevent abuse." KodrDriv would transform those casual words into professional,
                                structured commit messages.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Chapter 4 - Mastery */}
                <section id="mastery" className="story-section mastery">
                    <div className="background-layer">
                        <div className="mastery-visualization" style={{ transform: `translateY(${scrollY * 0.05}px)` }}>
                            <div className="neural-pathways"></div>
                            <div className="knowledge-graph"></div>
                        </div>
                    </div>
                    <div className="story-content-inner">
                        <h2 className="chapter-title">Mastery</h2>
                        <div className="story-text">
                            <p>
                                Six months later, KodrDriv had become an extension of Alex's mind. It knew when Alex was
                                working on critical bug fixes versus experimental features. It understood the difference
                                between customer-facing changes and internal refactoring. It had learned the team's
                                release cadence and could predict which changes belonged in which version.
                            </p>
                            <p>
                                "It's not just saving me time," Alex reflected during a team retrospective.
                                "It's making me a better developer. I think more clearly about my changes because
                                I know KodrDriv will document them properly."
                            </p>
                        </div>

                        <div className="testimonial">
                            <div className="testimonial-content">
                                <p>
                                    "KodrDriv doesn't just automate documentation — it elevates it.
                                    Our commit history went from cryptic one-liners to professional,
                                    searchable documentation that tells the story of our product."
                                </p>
                                <div className="testimonial-author">
                                    <div className="author-avatar">👨‍💻</div>
                                    <div className="author-info">
                                        <div className="author-name">Alex Chen</div>
                                        <div className="author-title">Senior Engineer, TechCorp</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="story-text">
                            <p>
                                The team's code review process transformed. Instead of spending time asking "what does this do?",
                                reviewers could focus on "is this the right approach?" KodrDriv's generated descriptions
                                provided the context that made meaningful code review possible.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Chapter 5 - The Future */}
                <section id="future" className="story-section future">
                    <div className="background-layer">
                        <div className="future-visualization" style={{ transform: `translateY(${scrollY * 0.1}px)` }}>
                            <div className="expanding-network"></div>
                            <div className="possibility-space"></div>
                        </div>
                    </div>
                    <div className="story-content-inner">
                        <h2 className="chapter-title">The Future</h2>
                        <div className="story-text">
                            <p>
                                Today, Alex's team ships features faster, with better documentation, and fewer bugs.
                                Their Git history reads like a professional engineering journal. New team members can
                                understand the codebase's evolution by reading commit messages alone.
                            </p>
                            <p>
                                But this is just the beginning. KodrDriv continues to learn, to adapt, to understand
                                the unique patterns of each developer and team. It's not replacing human creativity —
                                it's amplifying human intelligence.
                            </p>
                        </div>

                        <div className="future-features">
                            <div className="feature-preview">
                                <div className="feature-icon">🔮</div>
                                <h4>Predictive Commits</h4>
                                <p>AI that suggests commits before you're done coding</p>
                            </div>
                            <div className="feature-preview">
                                <div className="feature-icon">🌍</div>
                                <h4>Team Learning</h4>
                                <p>Collective intelligence that improves as teams grow</p>
                            </div>
                            <div className="feature-preview">
                                <div className="feature-icon">🔗</div>
                                <h4>Universal Integration</h4>
                                <p>Every tool in your workflow speaks the same language</p>
                            </div>
                        </div>

                        <div className="story-text">
                            <p>
                                The question isn't whether AI will change how we develop software.
                                The question is: will you be ready when it does?
                            </p>
                        </div>

                        <div className="cta-section">
                            <h3>Start Your Story</h3>
                            <p>Join thousands of developers who've transformed their Git workflow with KodrDriv.</p>
                            <div className="cta-buttons">
                                <a href="./installation" className="btn-primary">Install KodrDriv</a>
                                <a href="./" className="btn-secondary">Learn More</a>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Floating Progress */}
            <div className="progress-indicator">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${(currentChapter / (chapters.length - 1)) * 100}%` }}
                    ></div>
                </div>
            </div>
        </div>
    )
}

export default StoryPage
