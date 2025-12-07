"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (authData.user) {
        // Create account record - try different possible role values
        // Common allowed roles might be: 'user', 'employee', 'staff', 'member'
        // In your registration page's handleRegister function
            const { error: accountError } = await supabase
            .from('accounts')
            .insert({
                name: formData.name,
                email: formData.email,
                role: 'user', // or whatever role your constraint allows
                is_active: false, // New accounts require admin approval
                created_at: new Date().toISOString(),
            });

        if (accountError) {
          // If 'user' fails, try 'employee'
          const { error: accountError2 } = await supabase
            .from('accounts')
            .insert({
              name: formData.name,
              email: formData.email,
              role: 'employee', // Try 'employee'
              created_at: new Date().toISOString(),
            });

          if (accountError2) {
            // If both fail, show the error
            setError(`Registration failed: ${accountError2.message}. Please contact administrator.`);
            return;
          }
        }

        // Redirect to login
        router.push("/login?message=Registration successful. Please login.");
      }
    } catch (error: any) {
      setError(error.message || "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-0 p-0">
      {/* Navbar */}
      <nav className="bg-[#3a7a8c] flex items-center px-4 sm:px-6 md:px-6 h-14">
        <span className="text-green-500 text-sm font-semibold">Logo</span>
        <span className="text-white text-xl ml-3">BioSort</span>
      </nav>

      {/* Main Section */}
      <main className="flex flex-col md:flex-row min-h-[calc(100vh-56px)]">
        {/* Left Section with Image */}
        <section className="md:w-1/2 relative h-64 md:h-auto">
          <img
            src="https://storage.googleapis.com/a1aa/image/d36cf8cd-e1d5-4abc-306e-59025efa3b9d.jpg"
            alt="Outdoor urban scene with green and orange containers and trees in background"
            className="w-full h-full object-cover"
          />
          <div className="absolute top-12 md:top-20 left-4 md:left-8 bg-sky-500 rounded-xl p-4 md:p-6 max-w-full md:max-w-lg">
            <h1 className="text-3xl md:text-5xl font-extrabold text-white drop-shadow-[2px_2px_0_rgba(0,77,102,1)] select-none">
              BioSort
            </h1>
            <p className="mt-2 md:mt-4 text-sm md:text-lg leading-relaxed text-black font-normal">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
          </div>
        </section>

        {/* Right Section with Registration Form */}
        <section className="md:w-1/2 bg-sky-500 flex flex-col justify-between p-6 sm:p-10">
          <form className="max-w-md w-full mx-auto" onSubmit={handleRegister}>
            <h2 className="text-white font-extrabold text-3xl sm:text-4xl mb-8 sm:mb-10 text-center">
              Employee Registration
            </h2>

            {error && (
              <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            <label htmlFor="name" className="block mb-1 text-black font-normal text-sm sm:text-base">
              Full Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              className="w-full mb-4 sm:mb-6 py-2 sm:py-3 px-3 sm:px-4 rounded-full bg-gray-200 text-black text-sm sm:text-base focus:outline-none"
              required
            />

            <label htmlFor="email" className="block mb-1 text-black font-normal text-sm sm:text-base">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full mb-4 sm:mb-6 py-2 sm:py-3 px-3 sm:px-4 rounded-full bg-gray-200 text-black text-sm sm:text-base focus:outline-none"
              required
            />

            <label htmlFor="password" className="block mb-1 text-black font-normal text-sm sm:text-base">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={formData.password}
              onChange={handleChange}
              className="w-full mb-4 py-2 sm:py-3 px-3 sm:px-4 rounded-full bg-gray-200 text-black text-sm sm:text-base focus:outline-none"
              required
            />

            <label htmlFor="confirmPassword" className="block mb-1 text-black font-normal text-sm sm:text-base">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full mb-8 sm:mb-10 py-2 sm:py-3 px-3 sm:px-4 rounded-full bg-gray-200 text-black text-sm sm:text-base focus:outline-none"
              required
            />

            <div className="text-center">
              <button
                type="submit"
                disabled={loading}
                className="bg-black text-green-500 px-8 sm:px-12 py-2 sm:py-3 rounded-full font-mono text-sm sm:text-base tracking-wide disabled:opacity-50"
              >
                {loading ? "Registering..." : "Register"}
              </button>
            </div>

            <p className="mt-3 sm:mt-4 text-center text-black text-xs sm:text-sm font-normal">
              Already have an account?{" "}
              <a href="/login" className="text-white underline">
                Login here
              </a>
            </p>
          </form>

          {/* ESP Status Section */}
          <div className="flex flex-col sm:flex-row justify-between max-w-md w-full mx-auto mb-6 space-y-4 sm:space-y-0 sm:space-x-6">
            <div className="flex flex-col items-center">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 rounded-full bg-green-500 border border-black"></div>
                <span className="text-white text-base sm:text-lg select-none">ESP 32</span>
              </div>
              <span className="text-black text-xs mt-1 select-none">Connected</span>
            </div>

            <div className="flex flex-col items-center">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 rounded-full bg-red-600 border border-black"></div>
                <span className="text-white text-base sm:text-lg select-none">ESP 32 - CAM</span>
              </div>
              <span className="text-black text-xs mt-1 select-none">Disconnected</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default RegisterPage;