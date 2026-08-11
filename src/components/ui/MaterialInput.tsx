import React, { useId } from 'react';

type MaterialInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
};

export function MaterialInput({ label, id, className = '', ...props }: MaterialInputProps) {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
        <div className={`md-input-container ${className}`}>
            <input
                id={inputId}
                className="md-input"
                placeholder=" "
                {...props}
            />
            <label htmlFor={inputId} className="md-label">
                {label}
            </label>
        </div>
    );
}
