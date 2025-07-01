import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import LoadingSpinner from './LoadingSpinner'
import ErrorMessage from './ErrorMessage'
import MarkdownRenderer from './MarkdownRenderer'
import { navigationItems } from './Navigation'

function DocumentPage() {
    const { '*': splat } = useParams()
    const [content, setContent] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Determine which file to load based on the current path
    const currentPath = splat ? `/${splat}` : '/'
    const currentItem = navigationItems.find(item => item.path === currentPath)
    const fileName = currentItem?.file || 'README.md'

    useEffect(() => {
        setLoading(true)
        setError(null)

        // Get the base path from the current URL or use the import.meta.env.BASE_URL
        const basePath = import.meta.env.BASE_URL || '/'
        const fileUrl = `${basePath}${fileName}`

        // Fetch the markdown file from the public directory
        fetch(fileUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${fileName}: ${response.status}`)
                }
                return response.text()
            })
            .then(text => {
                setContent(text)
                setLoading(false)
            })
            .catch(err => {
                setError(err.message)
                setLoading(false)
            })
    }, [fileName])

    if (loading) {
        return <LoadingSpinner />
    }

    if (error) {
        return <ErrorMessage message={error} />
    }

    return <MarkdownRenderer content={content} />
}

export default DocumentPage 