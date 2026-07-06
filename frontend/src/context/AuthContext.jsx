import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("tracenet_user");
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback((token, userObj) => {
    localStorage.setItem("tracenet_token", token);
    localStorage.setItem("tracenet_user", JSON.stringify(userObj));
    setUser(userObj);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("tracenet_token");
    localStorage.removeItem("tracenet_user");
    setUser(null);
  }, []);

  const can = useCallback(
    (perm) => Array.isArray(user?.permissions) && user.permissions.includes(perm),
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthed: !!user, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
