import { useState, useRef, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useGateStore } from '../stores/gateStore';

const ENTRY_CODE = import.meta.env.VITE_ENTRY_CODE ?? '1234';
const LENGTH = 4;

export function Gate() {
  const navigate = useNavigate();
  const unlock = useGateStore((s) => s.unlock);
  const checkValid = useGateStore((s) => s.checkValid);

  if (checkValid()) {
    return <Navigate to="/home" replace />;
  }
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const setDigit = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;
      const next = [...digits];
      next[index] = value.slice(-1);
      setDigits(next);
      setError(null);

      if (value && index < LENGTH - 1) {
        const nextInput = document.getElementById(`digit-${index + 1}`);
        (nextInput as HTMLInputElement)?.focus();
      }

      if (next.every(Boolean) && next.join('').length === LENGTH) {
        const code = next.join('');
        if (code === ENTRY_CODE) {
          unlock();
          navigate('/home', { replace: true });
        } else {
          setError('Incorrect code');
          setDigits(Array(LENGTH).fill(''));
          focusInput();
        }
      }
    },
    [digits, unlock, navigate, focusInput]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        const prev = document.getElementById(`digit-${index - 1}`);
        (prev as HTMLInputElement)?.focus();
        setDigit(index - 1, '');
      }
    },
    [digits, setDigit]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
      const next = [...digits];
      for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
      setDigits(next);
      setError(null);
      if (pasted.length === LENGTH) {
        const code = next.join('');
        if (code === ENTRY_CODE) {
          unlock();
          navigate('/home', { replace: true });
        } else {
          setError('Incorrect code');
          setDigits(Array(LENGTH).fill(''));
        }
      }
      const focusIndex = Math.min(pasted.length, LENGTH - 1);
      const el = document.getElementById(`digit-${focusIndex}`);
      (el as HTMLInputElement)?.focus();
    },
    [digits, unlock, navigate]
  );

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-base cursor-text"
      onClick={focusInput}
    >
      <div className="card w-full max-w-sm p-10">
        <h1 className="m-0 mb-1 text-2xl font-bold text-center text-text tracking-tight">
          artjr
        </h1>
        <p className="m-0 mb-10 text-sm text-center text-secondary">
          Enter code to continue
        </p>
        <div className="flex gap-3 justify-center mb-4" onPaste={handlePaste}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={LENGTH}
            aria-label="Digit 1"
            id="digit-0"
            className="w-14 h-14 text-center text-lg font-semibold text-text bg-surface border border-border rounded-md focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 placeholder:text-tertiary transition-all"
            value={digits[0]}
            onChange={(e) => setDigit(0, e.target.value)}
            onKeyDown={(e) => handleKeyDown(0, e)}
          />
          {[1, 2, 3].map((i) => (
            <input
              key={i}
              type="text"
              inputMode="numeric"
              maxLength={1}
              aria-label={`Digit ${i + 1}`}
              id={`digit-${i}`}
              className="w-14 h-14 text-center text-lg font-semibold text-text bg-surface border border-border rounded-md focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 placeholder:text-tertiary transition-all"
              value={digits[i]}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
            />
          ))}
        </div>
        {error && (
          <p className="m-0 text-sm text-center text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
