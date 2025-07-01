interface ErrorMessageProps {
    message: string
}

function ErrorMessage({ message }: ErrorMessageProps) {
    return (
        <div className="error-message">
            <h2>⚠️ Error Loading Documentation</h2>
            <p>{message}</p>
            <p>Please try refreshing the page or check back later.</p>
        </div>
    )
}

export default ErrorMessage 