import { Sidebar } from './Sidebar';

interface LayoutProps {
    children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="flex h-screen w-screen bg-bg-primary overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto p-6">
                {children}
            </main>
        </div>
    );
}
