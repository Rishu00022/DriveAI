import React, { useState } from 'react';
import { login, register } from '../utils/api';
import { User, Lock, Mail, Phone, AlertCircle, X, Shield, Sparkles } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  if (!isOpen) return null;

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('passenger@driveai.com');
  const [password, setPassword] = useState('pass123');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const data = await register(email, password, fullName, phone);
        onAuthSuccess(data.user);
      } else {
        const data = await login(email, password);
        onAuthSuccess(data.user);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (role) => {
    if (role === 'admin') {
      setEmail('admin@driveai.com');
      setPassword('admin123');
    } else {
      setEmail('passenger@driveai.com');
      setPassword('pass123');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#121826] border border-[#1f293d] rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-xl bg-slate-800/60"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <User className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-extrabold text-white">
            {isRegister ? 'Create DriveAI Account' : 'Welcome to DriveAI'}
          </h3>
          <p className="text-xs text-slate-400">
            {isRegister
              ? 'Join the future of autonomous, driverless transportation'
              : 'Sign in to book robotic taxis and track live vehicle telemetry'}
          </p>
        </div>

        {/* Quick Demo Credentials Autofill */}
        {!isRegister && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('passenger')}
              className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/20 transition flex items-center justify-center space-x-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>Demo Passenger</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('admin')}
              className="flex-1 py-1.5 px-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold hover:bg-cyan-500/20 transition flex items-center justify-center space-x-1"
            >
              <Shield className="w-3 h-3" />
              <span>Demo Fleet Admin</span>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 p-3 rounded-xl flex items-center space-x-2 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {isRegister && (
            <>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Vance"
                    className="w-full bg-[#0a0e17] border border-[#1f293d] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mobile Number</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-[#0a0e17] border border-[#1f293d] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="passenger@driveai.com"
                className="w-full bg-[#0a0e17] border border-[#1f293d] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0a0e17] border border-[#1f293d] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-extrabold py-3 rounded-xl transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 mt-2"
          >
            {loading ? 'Authenticating...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Toggle between Register and Login */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-xs text-slate-400 hover:text-emerald-400 transition"
          >
            {isRegister
              ? 'Already registered? Sign in instead'
              : "Don't have an account? Create one"}
          </button>
        </div>

      </div>
    </div>
  );
}
