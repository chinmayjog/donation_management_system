import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Container } from 'react-bootstrap';
import { FaUsers, FaMoneyBillWave, FaReceipt, FaCalendarAlt } from 'react-icons/fa';
import Layout from './layout/Layout';
import { getAllDonors } from '../services/donorService';
import { getAllDonations } from '../services/donationService';
import { getAllEvents } from '../services/eventService';
import { DonationStats } from './donations';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalDonors: 0,
    totalDonations: 0,
    totalAmount: 0,
    upcomingEvents: 0
  });
  const [loading, setLoading] = useState(true);

  const calculateTotalAmount = (donations) => {
    return donations.reduce((total, donation) => total + (donation.amount || 0), 0);
  };

  const countUpcomingEvents = (events) => {
    const now = new Date();
    return events.filter(event => new Date(event.eventDate) > now).length;
  };

  const fetchData = useCallback(async () => {
    try {
      const [donorsResponse, donationsResponse, eventsResponse] = await Promise.all([
        getAllDonors({ limit: 1 }),
        getAllDonations({ limit: 1 }),
        getAllEvents({ limit: 1 })
      ]);

      // In a real implementation, we'd use counts from the API responses
      // For now, we'll use mock data
      setStats({
        totalDonors: donorsResponse.count || 0,
        totalDonations: donationsResponse.count || 0,
        totalAmount: calculateTotalAmount(donationsResponse.data || []),
        upcomingEvents: countUpcomingEvents(eventsResponse.data || [])
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <Layout>
      <Container>
        <h3 className="mb-4">Dashboard</h3>
        <Row>
          <Col md={3}>
            <Card className="dashboard-stat">
              <Card.Body className="text-center">
                <FaUsers size={30} className="text-primary mb-3" />
                <h5>Total Donors</h5>
                <h3>{stats.totalDonors}</h3>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="dashboard-stat">
              <Card.Body className="text-center">
                <FaMoneyBillWave size={30} className="text-success mb-3" />
                <h5>Total Donations</h5>
                <h3>{stats.totalDonations}</h3>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="dashboard-stat">
              <Card.Body className="text-center">
                <FaReceipt size={30} className="text-info mb-3" />
                <h5>Total Amount</h5>
                <h3>₹{stats.totalAmount.toLocaleString()}</h3>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3}>
            <Card className="dashboard-stat">
              <Card.Body className="text-center">
                <FaCalendarAlt size={30} className="text-warning mb-3" />
                <h5>Upcoming Events</h5>
                <h3>{stats.upcomingEvents}</h3>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Row className="mt-4">
          <Col md={12}>
            <DonationStats />
          </Col>
        </Row>

        <Row className="mt-4">
          <Col md={6}>
            <Card>
              <Card.Header>Recent Donations</Card.Header>
              <Card.Body>
                {loading ? (
                  <p>Loading recent donations...</p>
                ) : (
                  <p>No recent donations found</p>
                )}
              </Card.Body>
            </Card>
          </Col>
          <Col md={6}>
            <Card>
              <Card.Header>Upcoming Events</Card.Header>
              <Card.Body>
                {loading ? (
                  <p>Loading upcoming events...</p>
                ) : (
                  <p>No upcoming events found</p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </Layout>
  );
};

export default Dashboard;