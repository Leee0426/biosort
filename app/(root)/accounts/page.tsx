"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

interface Account {
  acc_id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  user_id: string;
}

const AdminAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  // Check if current user is admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // New account form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee"
  });
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    const initializeData = async () => {
      console.log('Current user:', user);
      const adminStatus = await checkUserRole();
      console.log('Admin status:', adminStatus);
      if (adminStatus) {
        await fetchAccounts();
      } else {
        setLoading(false);
      }
    };
    
    if (user) {
      initializeData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const checkUserRole = async (): Promise<boolean> => {
    if (!user) {
      console.log('No user found');
      return false;
    }

    try {
      setUserEmail(user.email || null);
      console.log('Checking role for user:', user.email, 'ID:', user.id);

      // Try to find account by user_id first, then fall back to email
      let { data: account, error } = await supabase
        .from('accounts')
        .select('role, user_id, email')
        .eq('user_id', user.id)
        .single();

      // If not found by user_id, try by email
      if (error || !account) {
        console.log('Not found by user_id, trying email...');
        const { data: accountByEmail, error: emailError } = await supabase
          .from('accounts')
          .select('role, user_id, email')
          .eq('email', user.email)
          .single();

        if (emailError) {
          console.error('Error fetching user role by email:', emailError);
          setError("User account not found in database");
          return false;
        }

        account = accountByEmail;
      }

      if (account) {
        console.log('Found account:', account);
        setUserRole(account.role);
        const adminStatus = account.role === 'admin';
        setIsAdmin(adminStatus);
        
        // If user_id is missing in accounts table but we found by email, update it
        if (!account.user_id && user.id) {
          console.log('Updating user_id for account...');
          const { error: updateError } = await supabase
            .from('accounts')
            .update({ user_id: user.id })
            .eq('email', user.email);
          
          if (updateError) {
            console.error('Error updating user_id:', updateError);
          }
        }
        
        return adminStatus;
      } else {
        setError("User account not found in database");
        return false;
      }
    } catch (error) {
      console.error('Error checking user role:', error);
      setError("Failed to verify user permissions");
      return false;
    }
  };

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Fetched accounts:', data);
      setAccounts(data || []);
    } catch (error: any) {
      console.error('Fetch accounts error:', error);
      setError(error.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateAccount = async (accountId: number) => {
    setActionLoading(accountId);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ is_active: true })
        .eq('acc_id', accountId);

      if (error) throw error;
      
      setAccounts(accounts.map(acc => 
        acc.acc_id === accountId ? { ...acc, is_active: true } : acc
      ));
    } catch (error: any) {
      console.error('Activate account error:', error);
      setError(error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivateAccount = async (accountId: number) => {
    setActionLoading(accountId);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ is_active: false })
        .eq('acc_id', accountId);

      if (error) throw error;
      
      setAccounts(accounts.map(acc => 
        acc.acc_id === accountId ? { ...acc, is_active: false } : acc
      ));
    } catch (error: any) {
      console.error('Deactivate account error:', error);
      setError(error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setError("");

    try {
      // First, create the auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newAccount.email,
        password: newAccount.password,
        options: {
          data: {
            name: newAccount.name,
            role: newAccount.role
          }
        }
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          throw new Error('This email is already registered');
        }
        throw authError;
      }

      if (authData.user) {
        // Then create the account record with user_id
        const { error: accountError } = await supabase
          .from('accounts')
          .insert({
            name: newAccount.name,
            email: newAccount.email,
            role: newAccount.role,
            is_active: true,
            created_at: new Date().toISOString(),
            user_id: authData.user.id
          });

        if (accountError) {
          console.error('Account creation failed:', accountError);
          throw accountError;
        }

        // Refresh the accounts list
        await fetchAccounts();
        
        // Reset form
        setNewAccount({
          name: "",
          email: "",
          password: "",
          role: "employee"
        });
        setShowCreateForm(false);
        
        setError(""); // Clear any previous errors
      }
    } catch (error: any) {
      console.error('Create account error:', error);
      setError(error.message || 'Failed to create account');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewAccount(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // Debug component to show current state
  const DebugInfo = () => (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white p-4 rounded-lg text-xs max-w-xs">
      <div><strong>Debug Info:</strong></div>
      <div>User: {user?.email || 'None'}</div>
      <div>User ID: {user?.id ? `${user.id.substring(0, 8)}...` : 'None'}</div>
      <div>Role: {userRole || 'Unknown'}</div>
      <div>Is Admin: {isAdmin ? 'Yes' : 'No'}</div>
      <div>Loading: {loading ? 'Yes' : 'No'}</div>
    </div>
  );

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="bg-gray-50 min-h-screen flex items-center justify-center">
          <div className="text-gray-900 text-xl flex items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            Loading...
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Show access denied if user is not admin
  if (!isAdmin) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          {/* Navbar - Same as Fine Tune page */}
          <nav className="bg-[#0a6b9a] flex items-center justify-between px-4 sm:px-6 md:px-6 h-14">
            <div className="flex items-center space-x-2">
              <img 
                src="/logo.png" 
                alt="BioSort Logo" 
                className="h-8 w-8"
              />
              <span className="text-white text-xl ml-3">BioSort</span>
            </div>
            <div className="flex items-center space-x-6">
              <ul className="flex items-center space-x-6 text-white text-base font-normal">
                <li 
                  onClick={() => router.push("/home")}
                  className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
                >
                  <span>Home</span>
                </li>
                <li 
                  onClick={() => router.push("/fine-tune")}
                  className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
                >
                  <span>Fine Tune</span>
                </li>
                <li 
                  onClick={() => router.push("/wifi-config")}
                  className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
                >
                  <span>WiFi Config</span>
                </li>
                <li className="flex items-center space-x-2 cursor-pointer select-none text-[#3bff00]">
                  <span>Accounts</span>
                </li>
              </ul>
              <button 
                onClick={handleLogout}
                className="ml-6 px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
              >
                Logout
              </button>
            </div>
          </nav>
          
          <main className="flex-grow flex items-center justify-center px-4">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center max-w-md w-full">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
              <p className="text-gray-600 mb-4">You don't have permission to access the Accounts page.</p>
              <div className="bg-red-50 rounded-lg p-4 mb-4 border border-red-200">
                <p className="text-sm text-red-800"><strong>Your Email:</strong> {userEmail}</p>
                <p className="text-sm text-red-800"><strong>Your Role:</strong> {userRole || 'Unknown'}</p>
                <p className="text-sm text-red-800 mt-2">Only users with <strong>admin</strong> role can access this page.</p>
              </div>
              <button
                onClick={() => router.push('/home')}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Go to Home
              </button>
            </div>
          </main>
          <DebugInfo />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Navbar - Same as Fine Tune page */}
        <nav className="bg-[#0a6b9a] flex items-center justify-between px-4 sm:px-6 md:px-6 h-14">
          <div className="flex items-center space-x-2">
            <img 
              src="/logo.png" 
              alt="BioSort Logo" 
              className="h-8 w-8"
            />
            <span className="text-white text-xl ml-3">BioSort</span>
          </div>
          <div className="flex items-center space-x-6">
            <ul className="flex items-center space-x-6 text-white text-base font-normal">
              <li 
                onClick={() => router.push("/home")}
                className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
              >
                <span>Home</span>
              </li>
              <li 
                onClick={() => router.push("/fine-tune")}
                className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
              >
                <span>Fine Tune</span>
              </li>
              <li 
                onClick={() => router.push("/wifi-config")}
                className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
              >
                <span>WiFi Config</span>
              </li>
              <li className="flex items-center space-x-2 cursor-pointer select-none text-[#3bff00]">
                <span>Accounts</span>
              </li>
            </ul>
            <button 
              onClick={handleLogout}
              className="ml-6 px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Account Management
              </h1>
              <p className="text-gray-600 text-lg">
                Manage employee accounts and activations
              </p>
              <div className="mt-2 text-sm text-gray-500">
                Logged in as: <strong>{userEmail}</strong> | Role: <strong>{userRole}</strong>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-center mx-auto max-w-2xl">
                {error}
              </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900">Total Accounts</h3>
                <p className="text-3xl font-bold text-gray-900 mt-2">{accounts.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900">Active Accounts</h3>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  {accounts.filter(acc => acc.is_active).length}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center hover:shadow-md transition-shadow">
                <h3 className="text-lg font-semibold text-gray-900">Pending Activation</h3>
                <p className="text-3xl font-bold text-red-600 mt-2">
                  {accounts.filter(acc => !acc.is_active).length}
                </p>
              </div>
            </div>

            {/* Create Account Button */}
            <div className="text-center mb-8">
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors duration-200"
              >
                {showCreateForm ? "Cancel" : "Create New Account"}
              </button>
            </div>

            {/* Create Account Form */}
            {showCreateForm && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 text-center">Create New Account</h2>
                <form onSubmit={handleCreateAccount} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={newAccount.name}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      required
                      placeholder="Enter full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={newAccount.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      required
                      placeholder="Enter email address"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={newAccount.password}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      required
                      minLength={6}
                      placeholder="Enter password (min 6 characters)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Role
                    </label>
                    <select
                      name="role"
                      value={newAccount.role}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                    >
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 text-center">
                    <button
                      type="submit"
                      disabled={createLoading}
                      className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200"
                    >
                      {createLoading ? "Creating..." : "Create Account"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Accounts Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-900 uppercase tracking-wider">
                        Account
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-900 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-900 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-900 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-900 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {accounts.map((account) => (
                      <tr key={account.acc_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {account.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {account.email}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                            account.role === 'admin' 
                              ? 'bg-blue-100 text-blue-800'
                              : account.role === 'manager'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {account.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                            account.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {account.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(account.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {account.is_active ? (
                            <button
                              onClick={() => handleDeactivateAccount(account.acc_id)}
                              disabled={actionLoading === account.acc_id}
                              className="text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === account.acc_id ? 'Deactivating...' : 'Deactivate'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleActivateAccount(account.acc_id)}
                              disabled={actionLoading === account.acc_id}
                              className="text-green-600 hover:text-green-800 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === account.acc_id ? 'Activating...' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {accounts.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-lg">
                  No accounts found
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Bottom notification box */}
        <section className="bg-white text-gray-600 rounded-xl shadow-sm border border-gray-200 p-6 mx-4 sm:mx-6 lg:mx-8 mb-8 text-center">
          Total Accounts: {accounts.length} | Active: {accounts.filter(acc => acc.is_active).length} | 
          Pending: {accounts.filter(acc => !acc.is_active).length}
        </section>
        <DebugInfo />
      </div>
    </ProtectedRoute>
  );
};

export default AdminAccountsPage;