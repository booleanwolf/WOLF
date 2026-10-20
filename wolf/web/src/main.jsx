import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api.js';
import { Loading, Toaster } from './ui.jsx';
import Shell from './Shell.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import CxLayout from './modules/clutchx3d/CxLayout.jsx';
import Overview from './modules/clutchx3d/Overview.jsx';
import Orders from './modules/clutchx3d/Orders.jsx';
import OrderDetail from './modules/clutchx3d/OrderDetail.jsx';
import Products from './modules/clutchx3d/Products.jsx';
import ProductEdit from './modules/clutchx3d/ProductEdit.jsx';
import Settings from './modules/clutchx3d/Settings.jsx';
import EntityForm from './workspace/EntityForm.jsx';
import EntityPage from './workspace/EntityPage.jsx';
import Routine from './pages/Routine.jsx';
import Calendar from './pages/Calendar.jsx';
import Cp from './pages/Cp.jsx';
import { DayPage } from './workspace/DayView.jsx';
import './styles.css';

function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api('/api/auth/me').then(setUser, () => setUser(null));
    const out = () => setUser(null);
    window.addEventListener('wolf:signed-out', out);
    return () => window.removeEventListener('wolf:signed-out', out);
  }, []);

  if (user === undefined) return <div className="boot"><Loading /></div>;
  if (!user) return <Login onSignedIn={setUser} />;

  const signOut = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };

  return (
    <Routes>
      <Route element={<Shell user={user} onSignOut={signOut} />}>
        <Route index element={<Home user={user} />} />
        <Route path="routine" element={<Routine />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="day/:date" element={<DayPage />} />
        <Route path="cp" element={<Cp />} />
        <Route path="w/new" element={<EntityForm />} />
        <Route path="w/:id" element={<EntityPage />} />
        <Route path="w/:id/edit" element={<EntityForm key="edit" />} />
        <Route path="b/clutchx3d" element={<CxLayout />}>
          <Route index element={<Overview />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductEdit />} />
          <Route path="products/:id" element={<ProductEdit />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>,
);
