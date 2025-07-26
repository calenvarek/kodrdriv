import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './StoryPage.css'

function StoryPage() {
    const [currentChapter, setCurrentChapter] = useState(0)

    useEffect(() => {
        const handleScroll = () => {
            // Calculate current chapter based on scroll position
            const windowHeight = window.innerHeight
            const chapter = Math.floor(window.scrollY / windowHeight)
            setCurrentChapter(Math.min(chapter, 5))
        }

        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const chapters = [
        { id: 'prologue', title: 'The Context Switch' },
        { id: 'discovery', title: 'First Contact' },
        { id: 'adaptation', title: 'Personalization' },
        { id: 'acceleration', title: 'No Pirates in the Release' },
        { id: 'review', title: 'Wait, I can Talk to KodrDriv?' },
        { id: 'links', title: 'Death by a Thousand Links' },
        { id: 'publishing', title: 'Publishing is a Pain' }
    ]

    return (
        <div className="story-page">
            {/* Navigation */}
            <nav className="story-nav">
                <div className="nav-content">
                    <div className="logo-section">
                        <a href="/kodrdriv/" className="logo-link">
                            <img
                                src="/kodrdriv/kodrdriv-logo.svg"
                                alt="KodrDriv Logo"
                                width="32"
                                height="32"
                                className="nav-logo"
                            />
                            <h1 className="nav-title">KodrDriv</h1>
                        </a>
                    </div>
                    <div className="nav-links">
                        <Link to="/">← Back to Home</Link>
                        <Link to="/commands">Commands</Link>
                        <a href="https://github.com/calenvarek/kodrdriv" target="_blank" rel="noopener noreferrer">
                            GitHub
                        </a>
                    </div>
                </div>
            </nav>

            {/* Story Content */}
            <main className="story-content">
                {/* Prologue - The Learning Machine */}
                <section id="prologue" className="story-section prologue">
                    <div className="story-content-inner">
                        <div className="story-header">
                            <h1 className="story-title">The Context Switch</h1>
                            <p className="story-subtitle">How KodrDriv eliminates the documentation burden</p>
                        </div>
                        <div className="story-text">
                            <p className="lead">
                                A developer sits in the flow state, mind fully absorbed in solving complex logic problems.
                                Hours pass unnoticed as elegant solutions emerge from intricate algorithms and data structures.
                                Then comes the inevitable interruption: the commit message dialog.
                            </p>
                            <p>
                                After six hours of deep coding, the cursor blinks mockingly in the Git commit dialog.
                                "What did I even change?" they wonder, staring at the diff that spans 14 files and 200 lines.
                                The deadline looms. The team waits. The mental switch from pure logic to documentation
                                feels like trying to write poetry while solving calculus.
                            </p>
                            <p>
                                This cognitive burden — the constant interruption of deep work to summarize and document —
                                is where our story begins, and where everything changes.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Chapter 1 - First Contact */}
                <section id="discovery" className="story-section discovery">
                    <div className="story-content-inner">
                        <h2 className="chapter-title">First Contact</h2>
                        <div className="story-text">
                            <p>
                                Three hours later, staring at the Git log, the developer scrolls through cryptic commit messages:
                                "fix stuff", "wip", "updates". "Ok, what was I working on three hours ago? How about two hours ago?"
                                The context has completely evaporated.
                            </p>
                            <p>
                                Frustrated, they turn to Slack: "Can anyone remember what I was working on in the auth module this morning?"
                                A teammate responds: "Have you installed KodrDriv yet? It can help with that."
                            </p>
                            <p>
                                One command: <code className="inline-code">npx @eldrforge/kodrdriv commit</code>
                            </p>
                            <div className="commit-message-box">
                                <code className="block-code">{`feat(auth): implement OAuth2 flow

- Add OAuth2 server integration
- Implement JWT validation
- Create session management

Breaking change: Auth required
Closes: #247, #198`}</code>
                            </div>
                            <p>
                                The AI analyzed the changes, understood the context, and generated this comprehensive commit message: →
                            </p>
                            <p>
                                "That's... exactly the commit message I needed," they realized, staring at the perfect summary
                                of hours of complex work distilled into a single, clear line.
                            </p>
                            <p>
                                The teammate chimed in again: "Oh, I forgot — next time run it with <code className="inline-code">--cached --sendit</code>"
                            </p>
                            <p>
                                "That means it'll create a git commit for everything that is staged for commit, and it will just commit it without having to copy the message.  This saves me at least an hour every day."
                            </p>
                        </div>


                    </div>
                </section>

                {/* Chapter 2 - Adaptation */}
                <section id="adaptation" className="story-section adaptation">
                    <div className="story-content-inner">
                        <h2 className="chapter-title">Personalization</h2>
                        <div className="story-text">
                            <p>
                                After a few days of using KodrDriv, the developer realized the commit messages, while perfect,
                                felt a bit... generic. Back to Slack: "Is there a way to make KodrDriv more personal? The messages
                                are great but they don't feel like *my* style.  I'm also missing pirate Tuesdays."
                            </p>
                            <p>
                                A teammate responded: "Oh absolutely! Create a <code className="inline-code">~/.kodrdriv</code> directory
                                and add some configuration. You can even set it to always use <code className="inline-code">--sendit</code> mode."
                            </p>

                            <div className="commit-message-box">
                                <code className="block-code">{`# ~/.kodrdriv/config.yaml
verbose: false
model: gpt-4.1
contextDirectories:
  - .kodrdriv/context
commit:
  add: true
  cached: true
  sendit: true

# ~/.kodrdriv/personas/you.md
You are a developer that values
accuracy, and you also write
all of your commit messages in
piratespeak on Tuesdays.`}</code>
                            </div>

                            <p>
                                "Wait, what?" they typed back. "Piratespeak on Tuesdays?"
                            </p>
                            <p>
                                "Trust me," came the reply. "Try it on a Tuesday. KodrDriv will honor any persona you give it.
                                The AI adapts to your style preferences, your team's conventions, even your sense of humor."
                            </p>
                            <p>
                                The teammate continued: "You know, we could also change how these commit messages are generated for the project if we created more context for the project. KodrDriv starts with the directory you are running it in and it checks for .kodrdriv customizations in every parent directory."
                            </p>
                            <p>
                                "Not so fast," the developer replied. "I'm getting used to this, let's just see if it gets Piratespeak right first."
                            </p>

                        </div>

                        <div className="metrics-display">
                            <div className="metric">
                                <div className="metric-value">127</div>
                                <div className="metric-label">Commits Generated</div>
                            </div>
                            <div className="metric">
                                <div className="metric-value">100%</div>
                                <div className="metric-label">Personal Style</div>
                            </div>
                            <div className="metric">
                                <div className="metric-value">3</div>
                                <div className="metric-label">Piratespeak Commits Generated</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Chapter 3 - Acceleration */}
                <section id="acceleration" className="story-section acceleration">
                    <div className="story-content-inner">
                        <h2 className="chapter-title">No Pirates in the Release</h2>
                        <div className="story-text">
                            <p>
                                Two weeks passed. During the weekly team meeting, their manager Sarah pulled up the Git log
                                and scrolled through the recent commits. "I'm noting that our commit messages are all very
                                detailed lately," she said, looking around the room. "They're professional and comprehensive,
                                but I'm noticing that they all seem like you spent actual time writing them."
                            </p>
                            <p>
                                She paused, suppressing a smile. "For example, I see that some of us are still respecting
                                Piratespeak Tuesday?"
                            </p>
                            <p>
                                After the meeting, the team retreated to their private Slack channel — the one without Sarah.
                                "Okay," someone typed, "are we all agreed that switching to KodrDriv was a good idea?"
                                A stream of checkmarks and thumbs-up emojis followed.
                            </p>
                            <p>
                                "The personality configuration was genius," another teammate added. "But speaking of which,
                                who's doing the release notes this sprint? We ship Friday."
                            </p>
                            <p>
                                The developer looked up from their screen. "How do I even do release notes? I've never
                                written them before."
                            </p>
                            <p>
                                "Easy," came the reply. "Just run <code className="inline-code">npx @eldrforge/kodrdriv release</code>"
                            </p>
                            <p>
                                "Oh, and just so you know — there's a different persona for generating release notes,
                                so you don't have to worry about Piratespeak Tuesdays."
                            </p>
                        </div>

                        <div className="workflow-showcase">
                            <div className="workflow-step">
                                <div className="step-icon">💻</div>
                                <div className="step-content">
                                    <h4>Personal Commits</h4>
                                    <p>Individual style and humor preserved</p>
                                </div>
                            </div>
                            <div className="workflow-arrow">→</div>
                            <div className="workflow-step">
                                <div className="step-icon">🤖</div>
                                <div className="step-content">
                                    <h4>Context Switching</h4>
                                    <p>Different personas for different audiences</p>
                                </div>
                            </div>
                            <div className="workflow-arrow">→</div>
                            <div className="workflow-step">
                                <div className="step-icon">📋</div>
                                <div className="step-content">
                                    <h4>Professional Releases</h4>
                                    <p>Customer-facing documentation, no pirates</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Chapter 4 - Review */}
                <section id="review" className="story-section review">
                    <div className="story-content-inner">
                        <h2 className="chapter-title">Wait, I can Talk to KodrDriv?</h2>
                        <div className="story-text">
                            <p>
                                A few days later, back in Slack, the original teammate who had introduced KodrDriv was
                                frustrated: "Ugh, this release has so many bugs. I'm going to be spending all weekend
                                filing GitHub issues to track them all."
                            </p>
                            <p>
                                The developer looked up, remembering their own learning curve. "You know, you can just
                                send that to the 'review' command in KodrDriv. If your GITHUB_TOKEN environment variable
                                is set correctly, the tool will just look at your review, examine the project, and create
                                a few GitHub issues automatically."
                            </p>
                            <p>
                                "Wait, what? <code className="inline-code">npx @eldrforge/kodrdriv review</code> does that?"
                            </p>
                            <p>
                                "Yeah, just run it and it'll start up your EDITOR and you can send it pages and pages of feedback.
                                After that it'll analyze it and, again, if you have a GITHUB_TOKEN, it'll prompt you to create new issues."
                            </p>
                            <p>
                                "That seems easy."
                            </p>
                            <p>
                                "You know, I haven't even told you about the audio-review feature yet. If you run
                                <code className="inline-code">select-audio</code> to choose a microphone, you can just complain to KodrDriv
                                and it'll take care of creating GitHub issues for you."
                            </p>
                            <p>
                                "Yep. You taught me about commit messages, now I'm teaching you about issue management.
                                Full circle.  Let's stop here, otherwise I'll be telling you about audio-commit."
                            </p>
                        </div>
                    </div>
                </section>

                {/* Chapter 5 - Death by a Thousand Links */}
                <section id="links" className="story-section links">
                    <div className="story-content-inner">
                        <h2 className="chapter-title">Death by a Thousand Links</h2>
                        <div className="story-text">
                            <p>
                                A week later, another developer in the team was venting in Slack: "Every time we update to a new version
                                of an open source project and I want to develop everything end-to-end without rebuilding everything,
                                I end up having to update the package.json with a link or a relative directory. This is getting really old,
                                and I'm inadvertently checking in broken crap to Git."
                            </p>
                            <p>
                                The now-experienced KodrDriv user jumped in: "Wait, I'm teaching you about KodrDriv again.
                                Just run <code className="inline-code">link</code> and <code className="inline-code">unlink</code>.
                                Configure KodrDriv with some directories for it to scan for package.json files, and you can just link
                                it to anything that's present on the filesystem. THEN when you need to deploy something to production,
                                run <code className="inline-code">unlink</code>."
                            </p>
                            <p>
                                "Is there an audio version of this one too?"
                            </p>
                            <p>
                                "No."
                            </p>
                        </div>
                    </div>
                </section>

                {/* Chapter 6 - Publishing is a Pain */}
                <section id="publishing" className="story-section publishing">
                    <div className="story-content-inner">
                        <h2 className="chapter-title">Publishing is a Pain</h2>
                        <div className="story-text">
                            <p>
                                The next sprint planning meeting had arrived, and Sarah was looking around the room.
                                "Okay team, we need to decide who's going to be responsible for publishing the next release.
                                It's a complex process — updating dependencies, running tests, creating release notes,
                                managing the PR, waiting for CI, merging, tagging, creating the GitHub release..."
                            </p>
                            <p>
                                The room fell silent. Everyone knew publishing was tedious and error-prone. Too many steps,
                                too many things that could go wrong, too much manual coordination required.
                            </p>
                            <p>
                                Slowly, one hand raised. It was the developer who had become the team's unofficial KodrDriv expert.
                            </p>
                            <p>
                                Sarah looked over with a knowing smile. "Let me guess — you have a way to automate this too?"
                            </p>
                            <p>
                                The developer grinned. "Well..."
                            </p>
                        </div>
                    </div>
                </section>
            </main>

            {/* Call to Action Section */}
            <section className="cta-wrapper">
                <div className="story-content-inner">
                    <div className="cta-section">
                        <h3>Start Your Story</h3>
                        <p>Join thousands of developers who've transformed their Git workflow with KodrDriv.</p>
                        <div className="cta-buttons">
                            <a href="/kodrdriv/installation" className="btn-primary">Install KodrDriv</a>
                            <a href="/kodrdriv/" className="btn-secondary">Learn More</a>
                        </div>
                    </div>
                </div>
            </section>

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
