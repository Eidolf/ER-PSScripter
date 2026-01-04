import React, { useState, useEffect, useRef } from 'react';
import { getTags } from '../api/snippets';

interface TagInputProps {
    value: string; // Comma separated tags
    onChange: (value: string) => void;
    placeholder?: string;
}

export default function TagInput({ value, onChange, placeholder }: TagInputProps) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [allTags, setAllTags] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [cursorPosition, setCursorPosition] = useState(0);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Load tags once
        getTags().then(tags => setAllTags(tags)).catch(console.error);
    }, []);

    useEffect(() => {
        // Handle clicks outside to close suggestions
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const getCurrentTag = (val: string, cursor: number) => {
        // Find the word being typed at cursor
        const left = val.slice(0, cursor).split(',').pop() || '';
        return left.trim();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        onChange(val);
        setCursorPosition(e.target.selectionStart || 0);

        const currentTag = getCurrentTag(val, e.target.selectionStart || 0);
        if (currentTag) {
            const filtered = allTags.filter(t => t.toLowerCase().startsWith(currentTag.toLowerCase()) && t !== currentTag);
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleSelectTag = (tag: string) => {
        // Replace current partial tag with selected tag
        const cursor = cursorPosition;
        const textBeforeCursor = value.slice(0, cursor);
        const textAfterCursor = value.slice(cursor);

        const lastCommaIndex = textBeforeCursor.lastIndexOf(',');
        const prefix = lastCommaIndex === -1 ? '' : textBeforeCursor.slice(0, lastCommaIndex + 1);

        // Add space after comma if needed
        const newText = (prefix ? prefix + ' ' : '') + tag + ', ' + textAfterCursor;

        onChange(newText);
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <input
                ref={inputRef}
                type="text"
                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder={placeholder || "Tags (comma separated)"}
                value={value}
                onChange={handleInputChange}
                onFocus={(e) => handleInputChange(e)} // Trigger suggestion on focus if valid
            />
            {showSuggestions && (
                <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-b-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                    {suggestions.map(tag => (
                        <div
                            key={tag}
                            className="p-2 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer text-gray-800 dark:text-gray-200"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectTag(tag);
                            }}
                        >
                            #{tag}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
