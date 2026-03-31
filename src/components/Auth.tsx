import { useState } from 'react';
import { signInWithGoogle } from '../lib/firebase';
import { CalendarDays, AlertCircle, Loader2 } from 'lucide-react';

export default function Auth() {
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setIsLoggingIn(true);
    try {
      const user = await signInWithGoogle();
      if (!user) {
        // User cancelled or closed the popup - no error needed
        return;
      }
    } catch (err: any) {
      // Filter out common user-cancelled errors
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        console.log('Sign-in cancelled by user');
      } else {
        setError(err.message || 'An unexpected error occurred during sign-in.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="bg-orange-100 p-4 rounded-full">
            <CalendarDays className="w-12 h-12 text-orange-600" />
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-stone-800 mb-2">Papa's Job Tracker</h1>
          <p className="text-stone-500 text-lg">Track your daily jobs and earnings easily.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={isLoggingIn}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-xl font-medium py-4 px-6 rounded-2xl transition-all shadow-md flex items-center justify-center gap-3"
        >
          {isLoggingIn ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" className="w-6 h-6 bg-white rounded-full p-0.5" />
          )}
          {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}
