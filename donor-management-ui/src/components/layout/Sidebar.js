import React from 'react';
import { Nav } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { FaHome, FaUsers, FaMoneyBillWave, FaReceipt, FaCalendarAlt, FaCog } from 'react-icons/fa';

const Sidebar = () => {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="sidebar p-3">
      <Nav className="flex-column">
        <Nav.Link
          as={Link}
          to="/dashboard"
          className={`mb-2 ${isActive('/dashboard') ? 'active bg-primary' : ''}`}
        >
          <FaHome className="me-2" />
          Dashboard
        </Nav.Link>
        <Nav.Link
          as={Link}
          to="/donors"
          className={`mb-2 ${isActive('/donors') ? 'active bg-primary' : ''}`}
        >
          <FaUsers className="me-2" />
          Donors
        </Nav.Link>
        <Nav.Link
          as={Link}
          to="/donations"
          className={`mb-2 ${isActive('/donations') ? 'active bg-primary' : ''}`}
        >
          <FaMoneyBillWave className="me-2" />
          Donations
        </Nav.Link>
        <Nav.Link
          as={Link}
          to="/receipts"
          className={`mb-2 ${isActive('/receipts') ? 'active bg-primary' : ''}`}
        >
          <FaReceipt className="me-2" />
          Receipts
        </Nav.Link>
        <Nav.Link
          as={Link}
          to="/events"
          className={`mb-2 ${isActive('/events') ? 'active bg-primary' : ''}`}
        >
          <FaCalendarAlt className="me-2" />
          Events
        </Nav.Link>
        <Nav.Link
          as={Link}
          to="/settings"
          className={`mb-2 ${isActive('/settings') ? 'active bg-primary' : ''}`}
        >
          <FaCog className="me-2" />
          Settings
        </Nav.Link>
      </Nav>
    </div>
  );
};

export default Sidebar;
