"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Lock, User, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const success = await login(username, password);
    
    if (success) {
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in.",
      });
      router.push('/dashboard');
    } else {
      toast({
        title: "Login Failed",
        description: "Invalid credentials. Please try again.",
        variant: "destructive",
      });
    }
    
    setIsSubmitting(false);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-background">
      {/* Background Decorator - Subtle mesh style matching the system */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      {/* Login Card */}
      <Card className="relative z-10 w-full max-w-md bg-card shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] overflow-hidden border border-border rounded-2xl">
        {/* Institutional Header Banner */}
        <div className="bg-primary px-6 py-3 flex items-center justify-center gap-2">
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
            <Shield className="w-3 h-3 text-white" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/90">
            OFFICIAL SYSTEM ACCESS • NED UNIVERSITY
          </span>
        </div>

        <CardHeader className="text-center space-y-6 pt-10 pb-4">
          {/* Main Logo Container - Using NED Seal */}
          <div className="flex justify-center relative">
            <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
            <div className="relative w-28 h-28 rounded-2xl bg-card p-2 shadow-xl overflow-hidden group hover:scale-105 transition-all duration-500 border border-border">
              <picture>
                <source srcSet="/ned_logo_bg.webp" type="image/webp" />
                <img
                  src="/ned_logo_bg.png"
                  alt="NED UET Seal"
                  className="w-full h-full object-contain"
                  loading="eager"
                  decoding="async"
                />
              </picture>
            </div>
          </div>

          <div className="space-y-1">
            <CardTitle className="text-3xl font-extrabold tracking-tight text-foreground">
              Asset Management System
            </CardTitle>
            <CardDescription className="text-muted-foreground/60 text-sm font-bold uppercase tracking-widest px-2">
              NED University of Engineering & Technology
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6 pb-8 px-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Username Field */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-muted-foreground text-xs font-bold uppercase tracking-wider ml-1">
                  Username
                </Label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 h-12 bg-card border-border text-foreground placeholder:text-muted-foreground/50 focus:ring-primary/20 transition-all rounded-xl"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-muted-foreground text-xs font-bold uppercase tracking-wider ml-1">
                  Password
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12 bg-card border-border text-foreground placeholder:text-muted-foreground/50 focus:ring-primary/20 transition-all rounded-xl"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-primary transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider px-1">
              <div className="flex items-center gap-2">
                <Checkbox id="remember" className="border-border" />
                <label htmlFor="remember" className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors cursor-pointer">
                  Remember Me
                </label>
              </div>
              <a href="#" className="text-primary hover:text-primary/80 transition-colors">
                Reset Credentials
              </a>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-[0.15em] rounded-2xl shadow-[0_8px_32px_-4px_rgba(29,66,137,0.3)] hover:shadow-[0_12px_48px_-4px_rgba(29,66,137,0.4)] transition-all hover:-translate-y-0.5 active:translate-y-0"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Authenticating...
                </span>
              ) : (
                'Login'
              )}
            </Button>
          </form>
        </CardContent>

        {/* Branding Footer */}
        <div className="bg-muted/30 px-6 py-4 border-t border-border text-center">
          <p className="text-[10px] text-muted-foreground/40 font-medium tracking-widest uppercase">
            Official System Access • Secured by NED ICT
          </p>
        </div>
      </Card>

      {/* Page Footer */}
      <div className="absolute bottom-6 text-[10px] text-muted-foreground/30 font-bold uppercase tracking-[0.3em] flex items-center gap-4">
        <span>University Infrastructure</span>
        <div className="w-1 h-1 rounded-full bg-primary/20" />
        <span>Version 4.1.0</span>
      </div>
    </div>
  );
};

export default LoginPage;
