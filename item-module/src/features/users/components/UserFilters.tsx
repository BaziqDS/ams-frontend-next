import { useRouter } from "next/navigation";
import { Search, User, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

interface UserFiltersProps {
    search: string;
    setSearch: (val: string) => void;
}

export function UserFilters({ search, setSearch }: UserFiltersProps) {
    const router = useRouter();
    const { user } = useAuth();

    return (
        <>
            <div className="flex items-center gap-4 bg-card px-4 py-1.5 rounded-xl border border-border shadow-sm focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5 transition-all duration-200">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border-none focus-within:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm h-7 p-0 bg-transparent min-w-[200px] focus:outline-none"
                />
            </div>
            {user?.is_superuser && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => router.push('/persons')}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary bg-navy-surface hover:bg-navy-surface/80 rounded-lg transition-colors border border-navy-muted shadow-sm"
                    >
                        <User className="w-4 h-4" />
                        Persons Module
                    </button>
                    <button
                        onClick={() => router.push('/roles')}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary bg-navy-surface hover:bg-navy-surface/80 rounded-lg transition-colors border border-navy-muted"
                    >
                        <Shield className="w-4 h-4" />
                        Manage Custom Roles
                    </button>
                </div>
            )}
        </>
    );
}
