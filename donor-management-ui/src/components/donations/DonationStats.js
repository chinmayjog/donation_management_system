import React, { useState, useEffect } from 'react';
import { Card, Row, Col } from 'react-bootstrap';
import { getAllDonations } from '../../services/donationService';

const DonationStats = () => {
  const [stats, setStats] = useState({
    totalDonations: 0,
    totalAmount: 0,
    averageDonation: 0,
    recentDonations: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Get recent donations (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const params = {
          startDate: thirtyDaysAgo.toISOString().split('T')[0],
          limit: 100 // Get enough data for calculations
        };
        
        const response = await getAllDonations(params);
        const donations = response.data || [];
        
        // Calculate stats
        const totalAmount = donations.reduce((sum, donation) => sum + donation.amount, 0);
        const averageDonation = donations.length > 0 ? totalAmount / donations.length : 0;
        
        setStats({
          totalDonations: donations.length,
          totalAmount,
          averageDonation,
          recentDonations: donations.slice(0, 5) // Most recent 5
        });
      } catch (error) {
        console.error('Error fetching donation stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // Format currency
  const formatCurrency = (amount) => {
    return `₹${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <div>Loading donation statistics...</div>;
  }

  return (
    <div className="donation-stats">
      <Row>
        <Col md={4}>
          <Card className="mb-4">
            <Card.Body className="text-center">
              <h6 className="text-muted">Total Donations (30 days)</h6>
              <h2>{stats.totalDonations}</h2>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mb-4">
            <Card.Body className="text-center">
              <h6 className="text-muted">Total Amount (30 days)</h6>
              <h2>{formatCurrency(stats.totalAmount)}</h2>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mb-4">
            <Card.Body className="text-center">
              <h6 className="text-muted">Average Donation</h6>
              <h2>{formatCurrency(stats.averageDonation)}</h2>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      
      <Card>
        <Card.Header>Recent Donations</Card.Header>
        <Card.Body>
          {stats.recentDonations.length === 0 ? (
            <p className="text-muted">No recent donations found</p>
          ) : (
            <div className="recent-donations">
              {stats.recentDonations.map(donation => (
                <div key={donation.id} className="donation-item d-flex justify-content-between align-items-center mb-2 p-2 border-bottom">
                  <div>
                    <div className="donor-name fw-bold">{donation.donor.firstName} {donation.donor.lastName}</div>
                    <div className="text-muted small">{new Date(donation.donationDate).toLocaleDateString()}</div>
                  </div>
                  <div className="amount fw-bold">{formatCurrency(donation.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default DonationStats;