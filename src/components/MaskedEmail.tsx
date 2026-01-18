import { useState } from 'react';
import { maskEmail } from '../utils/emailMask';

interface MaskedEmailProps {
    email: string;
    className?: string;
}

/**
 * Displays a masked email that reveals on hover
 */
export function MaskedEmail({ email, className = '' }: MaskedEmailProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <span
            className={`cursor-pointer transition-all duration-200 ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title={email}
        >
            {isHovered ? email : maskEmail(email)}
        </span>
    );
}
