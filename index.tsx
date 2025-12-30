/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

// Types
type Result = {
    id: string;
    image: string; // base64 data URL
    text: string;
};

// Helper Functions
const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve({ data: base64Data, mimeType: file.type });
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

// SVG Icon Component
const UploadIcon = () => (
    <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
);

// Child Components
const ImageUploader = ({ index, file, onFileChange, onRemoveImage }: {
    index: number;
    file: File | null;
    onFileChange: (index: number, file: File | null) => void;
    onRemoveImage: (index: number) => void;
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDragOver = (e: React.DragEvent) => e.preventDefault();
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onFileChange(index, e.dataTransfer.files[0]);
        }
    };

    return (
        <div
            className={`upload-box ${isDragging ? 'drag-over' : ''}`}
            onClick={() => document.getElementById(`file-input-${index}`)?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            role="button"
            aria-label={`Upload image ${index + 1}`}
            tabIndex={0}
        >
            <input
                type="file"
                id={`file-input-${index}`}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => onFileChange(index, e.target.files?.[0] ?? null)}
            />
            {previewUrl ? (
                <>
                    <img src={previewUrl} alt={`Preview ${index + 1}`} className="image-preview" />
                    <button
                        className="remove-image-btn"
                        aria-label={`Remove image ${index + 1}`}
                        onClick={(e) => { e.stopPropagation(); onRemoveImage(index); }}
                    >&times;</button>
                </>
            ) : (
                <>
                    <UploadIcon />
                    <p>Image {index + 1}</p>
                </>
            )}
        </div>
    );
};

const PromptExamples = ({ onSelect }: { onSelect: (prompt: string) => void }) => {
    const examples = [
        "A cat wearing the sunglasses from image 2",
        "Merge all images into a surreal landscape",
        "Image 1 in the artistic style of image 2",
        "Create a pop-art collage from these photos",
    ];
    return (
        <div className="prompt-examples">
            <p>Need inspiration? Try one of these:</p>
            <div className="example-buttons">
                {examples.map(ex => (
                    <button key={ex} className="example-prompt-btn" onClick={() => onSelect(ex)}>
                        {ex}
                    </button>
                ))}
            </div>
        </div>
    );
};

const ResultDisplay = ({ result }: { result: Result | null }) => {
    if (!result) return null;
    return (
        <div className="result-content">
            <div className="result-image-container">
                <img src={result.image} alt="Fused result" className="result-image" />
            </div>
            <p className="result-text">{result.text}</p>
            <a href={result.image} download="fused-image.png" className="download-btn">Download Image</a>
        </div>
    );
};

const HistoryDisplay = ({ history, onSelect }: { history: Result[]; onSelect: (item: Result) => void }) => {
    if (history.length === 0) return null;
    return (
        <section className="history-section">
            <h2>Fusion History</h2>
            <div className="history-grid">
                {history.map((item) => (
                    <div
                        key={item.id}
                        className="history-item"
                        onClick={() => onSelect(item)}
                        onKeyDown={(e) => e.key === 'Enter' && onSelect(item)}
                        tabIndex={0}
                        role="button"
                        aria-label={`View fusion created at ${new Date(parseInt(item.id)).toLocaleTimeString()}`}
                    >
                        <img src={item.image} alt={item.text.substring(0, 50)} className="history-thumbnail" />
                    </div>
                ))}
            </div>
        </section>
    );
};

// Main App Component
const App = () => {
    const [imageCount, setImageCount] = useState<number>(2);
    const [images, setImages] = useState<(File | null)[]>(Array(5).fill(null));
    const [prompt, setPrompt] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const [activeResult, setActiveResult] = useState<Result | null>(null);
    const [history, setHistory] = useState<Result[]>([]);
    const [error, setError] = useState<string>('');

    const isFuseDisabled = useMemo(() => {
        const uploadedImages = images.slice(0, imageCount).filter(Boolean);
        return loading || !prompt.trim() || uploadedImages.length !== imageCount;
    }, [images, imageCount, prompt, loading]);

    const handleImageCountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const count = parseInt(e.target.value, 10);
        setImageCount(count);
        const newImages = [...images];
        for (let i = count; i < newImages.length; i++) {
            newImages[i] = null;
        }
        setImages(newImages);
    };

    const handleFileChange = (index: number, file: File | null) => {
        if (file && file.type.startsWith('image/')) {
            const newImages = [...images];
            newImages[index] = file;
            setImages(newImages);
            setError('');
        } else if (file) {
            setError('Please upload only image files.');
        }
    };

    const handleRemoveImage = (index: number) => {
        const newImages = [...images];
        newImages[index] = null;
        setImages(newImages);
    };

    const handleSelectHistory = (item: Result) => {
        setActiveResult(item);
        document.querySelector('.result-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleFuseClick = async () => {
        setLoading(true);
        setError('');
        setActiveResult(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const imageParts = await Promise.all(
                images.slice(0, imageCount)
                    .filter((img): img is File => img !== null)
                    .map(file => fileToBase64(file))
            );

            if (imageParts.length !== imageCount) {
                throw new Error("Mismatch in image processing. Please try again.");
            }

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: {
                    parts: [
                        ...imageParts.map(p => ({ inlineData: p })),
                        { text: prompt },
                    ],
                },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });

            const imagePart = response.candidates?.[0]?.content.parts.find(p => p.inlineData);
            const textPart = response.candidates?.[0]?.content.parts.find(p => p.text);

            if (imagePart?.inlineData) {
                const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                const newResult: Result = {
                    id: Date.now().toString(),
                    image: imageUrl,
                    text: textPart?.text || 'Here is your fused image!',
                };
                setActiveResult(newResult);
                setHistory(prev => [newResult, ...prev.slice(0, 9)]); // Add to history, keep max 10
            } else {
                throw new Error(textPart?.text || 'The AI could not generate an image from your request.');
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'An error occurred while fusing the images.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (loading) {
            const messages = [
                "Consulting the AI muse...",
                "Fusing pixels with creativity...",
                "This can take a minute, hold tight!",
                "Unleashing digital magic...",
            ];
            let i = 0;
            setLoadingMessage(messages[i]);
            const interval = setInterval(() => {
                i = (i + 1) % messages.length;
                setLoadingMessage(messages[i]);
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [loading]);

    return (
        <div className="app-container">
            <header className="hero-section">
                <h1 className="hero-title">
                    <span className="gradient-text">Image Fusion</span>
                    <span className="subtitle">Combine images with AI!</span>
                </h1>
            </header>

            <section className="controls-section">
                <div className="control-item">
                    <label htmlFor="imageCount">How many images?</label>
                    <select id="imageCount" value={imageCount} onChange={handleImageCountChange}>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                    </select>
                </div>
            </section>

            <section className="uploads-section">
                <div className="upload-grid">
                    {Array.from({ length: imageCount }).map((_, i) => (
                        <ImageUploader key={i} index={i} file={images[i]} onFileChange={handleFileChange} onRemoveImage={handleRemoveImage} />
                    ))}
                </div>
            </section>

            <section className="prompt-section">
                <div className="control-item">
                    <label htmlFor="prompt">Describe how to fuse them</label>
                    <textarea
                        id="prompt"
                        className="prompt-input"
                        placeholder="e.g., A cat wearing the sunglasses from image 2, in the art style of image 1."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />
                </div>
                <PromptExamples onSelect={setPrompt} />
            </section>

            <section className="action-section">
                <button className="fuse-btn" onClick={handleFuseClick} disabled={isFuseDisabled}>
                    {loading ? 'Fusing...' : 'Fuse Images'}
                </button>
            </section>

            {(loading || error || activeResult) && (
                <section className="result-section">
                    {loading && (
                        <div className="loading-container">
                            <div className="loader"></div>
                            <p className="loading-message">{loadingMessage}</p>
                        </div>
                    )}
                    {error && !loading && <p className="error-message">{error}</p>}
                    {!loading && <ResultDisplay result={activeResult} />}
                </section>
            )}

            <HistoryDisplay history={history} onSelect={handleSelectHistory} />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><App /></React.StrictMode>);
