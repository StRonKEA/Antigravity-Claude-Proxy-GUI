import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
    width?: string | number;
    height?: string | number;
    animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
    className = '',
    variant = 'text',
    width,
    height,
    animation = 'pulse'
}: SkeletonProps) {
    const baseClasses = 'bg-white/10';

    const variantClasses = {
        text: 'rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-none',
        rounded: 'rounded-lg'
    };

    const animationClasses = {
        pulse: 'animate-pulse',
        wave: 'animate-shimmer',
        none: ''
    };

    const style: React.CSSProperties = {
        width: width,
        height: height || (variant === 'text' ? '1em' : undefined)
    };

    return (
        <div
            className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
            style={style}
        />
    );
}

// Preset skeleton patterns
export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
    return (
        <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    variant="text"
                    width={i === lines - 1 ? '60%' : '100%'}
                    height={14}
                />
            ))}
        </div>
    );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
    return (
        <div className={`glass-card p-4 ${className}`}>
            <div className="flex items-center gap-3 mb-4">
                <Skeleton variant="circular" width={40} height={40} />
                <div className="flex-1">
                    <Skeleton variant="text" width="50%" height={16} className="mb-2" />
                    <Skeleton variant="text" width="30%" height={12} />
                </div>
            </div>
            <SkeletonText lines={3} />
        </div>
    );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="flex gap-4 p-2 border-b border-white/10">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} variant="text" width={`${100 / cols}%`} height={14} />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex gap-4 p-2">
                    {Array.from({ length: cols }).map((_, colIndex) => (
                        <Skeleton
                            key={colIndex}
                            variant="text"
                            width={`${100 / cols}%`}
                            height={12}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

export function SkeletonStats() {
    return (
        <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-card p-4 text-center">
                    <Skeleton variant="circular" width={24} height={24} className="mx-auto mb-2" />
                    <Skeleton variant="text" width="60%" height={24} className="mx-auto mb-1" />
                    <Skeleton variant="text" width="40%" height={12} className="mx-auto" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonDashboard() {
    return (
        <div className="space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Skeleton variant="text" width={120} height={24} />
                <div className="flex gap-3">
                    <Skeleton variant="rounded" width={100} height={32} />
                    <Skeleton variant="circular" width={32} height={32} />
                </div>
            </div>

            {/* Control Panel */}
            <div className="glass-card p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <Skeleton variant="circular" width={64} height={64} />
                        <div>
                            <Skeleton variant="text" width={100} height={12} className="mb-2" />
                            <Skeleton variant="text" width={80} height={28} className="mb-2" />
                            <Skeleton variant="text" width={200} height={12} />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Skeleton variant="rounded" width={100} height={40} />
                        <Skeleton variant="rounded" width={80} height={40} />
                    </div>
                </div>
            </div>

            {/* Stats */}
            <SkeletonStats />

            {/* Token Usage */}
            <div className="glass-card p-4">
                <Skeleton variant="text" width={100} height={14} className="mb-3" />
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Skeleton variant="text" width={80} height={12} />
                        <Skeleton variant="text" width={60} height={12} />
                    </div>
                    <div className="flex justify-between">
                        <Skeleton variant="text" width={80} height={12} />
                        <Skeleton variant="text" width={60} height={12} />
                    </div>
                </div>
            </div>

            {/* Quota Status */}
            <div className="glass-card p-4">
                <Skeleton variant="text" width={100} height={14} className="mb-3" />
                <div className="grid grid-cols-[140px_1fr] gap-4">
                    <Skeleton variant="circular" width={120} height={120} />
                    <div className="space-y-2">
                        <Skeleton variant="rounded" width="100%" height={40} />
                        <Skeleton variant="rounded" width="100%" height={40} />
                        <Skeleton variant="rounded" width="100%" height={40} />
                    </div>
                </div>
            </div>
        </div>
    );
}
