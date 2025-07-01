interface LoadingSpinnerProps {
    message?: string
}

function LoadingSpinner({ message = "Loading documentation..." }: LoadingSpinnerProps) {
    return (
        <div className="loading-spinner">
            <div className="spinner"></div>
            <p>{message}</p>
        </div>
    )
}

export default LoadingSpinner 