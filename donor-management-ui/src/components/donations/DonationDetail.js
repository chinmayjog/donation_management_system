import React, { useState, useEffect } from 'react';
import { Container, Card, Row, Col, Button, Badge, Alert } from 'react-bootstrap';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../layout/Layout';
import { getDonationById } from '../../services/donationService';
import { createReceipt, sendReceipt } from '../../services/receiptService';
import { FaEdit, FaPrint, FaEnvelope, FaWhatsapp, FaSms } from 'react-icons/fa';
import { toast } from 'react-toastify';

const DonationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [donation, setDonation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingReceipt, setGeneratingReceipt] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);

  useEffect(() => {
    fetchDonation();
  }, [id]);

  const fetchDonation = async () => {
    setLoading(true);
    try {
      const data = await getDonationById(id);
      setDonation(data);
    } catch (error) {
      console.error('Error fetching donation:', error);
      setError('Failed to load donation details');
    } finally {
      setLoading(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Format amount
  const formatAmount = (amount) => {
    return `₹${amount.toLocaleString()}`;
  };

  // Generate receipt
  const handleGenerateReceipt = async (deliveryMethod) => {
    setGeneratingReceipt(true);
    try {
      const receipt = await createReceipt({
        donationId: donation.id,
        deliveryMethod: deliveryMethod || 'EMAIL'
      });
      
      toast.success('Receipt generated successfully');
      fetchDonation(); // Refresh donation data to show the receipt
    } catch (error) {
      console.error('Error generating receipt:', error);
      toast.error('Failed to generate receipt');
    } finally {
      setGeneratingReceipt(false);
    }
  };

  // Send receipt
  const handleSendReceipt = async (deliveryMethod) => {
    if (!donation.receipt || !donation.receipt.id) {
      toast.error('No receipt found. Please generate a receipt first.');
      return;
    }
    
    setSendingReceipt(true);
    try {
      await sendReceipt(donation.receipt.id, deliveryMethod);
      toast.success(`Receipt sent via ${deliveryMethod.toLowerCase()}`);
      fetchDonation(); // Refresh donation data
    } catch (error) {
      console.error('Error sending receipt:', error);
      toast.error('Failed to send receipt');
    } finally {
      setSendingReceipt(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Container>
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-2">Loading donation details...</p>
          </div>
        </Container>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Container>
          <Alert variant="danger">{error}</Alert>
          <Button variant="primary" onClick={() => navigate('/donations')}>
            Back to Donations
          </Button>
        </Container>
      </Layout>
    );
  }

  if (!donation) {
    return (
      <Layout>
        <Container>
          <Alert variant="warning">Donation not found</Alert>
          <Button variant="primary" onClick={() => navigate('/donations')}>
            Back to Donations
          </Button>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h3>Donation Details</h3>
          <div>
            <Button 
              as={Link} 
              to={`/donations/${donation.id}/edit`} 
              variant="outline-primary"
              className="me-2"
            >
              <FaEdit className="me-2" /> Edit
            </Button>
            <Button 
              variant="primary" 
              onClick={() => navigate('/donations')}
            >
              Back to Donations
            </Button>
          </div>
        </div>

        <Row>
          <Col md={8}>
            <Card className="mb-4">
              <Card.Header as="h5">Donation Information</Card.Header>
              <Card.Body>
                <Row className="mb-3">
                  <Col md={6}>
                    <p className="mb-1 text-muted">Amount</p>
                    <h4>{formatAmount(donation.amount)}</h4>
                  </Col>
                  <Col md={6}>
                    <p className="mb-1 text-muted">Date</p>
                    <h5>{formatDate(donation.donationDate)}</h5>
                  </Col>
                </Row>
                <Row className="mb-3">
                  <Col md={6}>
                    <p className="mb-1 text-muted">Payment Method</p>
                    <p>{donation.paymentMethod.replace('_', ' ')}</p>
                  </Col>
                  <Col md={6}>
                    <p className="mb-1 text-muted">Transaction Reference</p>
                    <p>{donation.transactionReference || 'N/A'}</p>
                  </Col>
                </Row>
                {donation.notes && (
                  <div className="mb-3">
                    <p className="mb-1 text-muted">Notes</p>
                    <p>{donation.notes}</p>
                  </div>
                )}
                <div>
                  <p className="mb-1 text-muted">Recorded At</p>
                  <p>{new Date(donation.createdAt).toLocaleString()}</p>
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="mb-4">
              <Card.Header as="h5">Donor Information</Card.Header>
              <Card.Body>
                <p className="mb-1 text-muted">Name</p>
                <h5>
                  <Link to={`/donors/${donation.donor.id}`} className="text-decoration-none">
                    {donation.donor.firstName} {donation.donor.lastName}
                  </Link>
                </h5>
                {donation.donor.email && (
                  <div className="mb-3">
                    <p className="mb-1 text-muted">Email</p>
                    <p>{donation.donor.email}</p>
                  </div>
                )}
                {donation.donor.phone && (
                  <div>
                    <p className="mb-1 text-muted">Phone</p>
                    <p>{donation.donor.phone}</p>
                  </div>
                )}
              </Card.Body>
            </Card>

            <Card>
              <Card.Header as="h5">Receipt</Card.Header>
              <Card.Body>
                {donation.receipt ? (
                  <>
                    <p className="mb-1 text-muted">Receipt Number</p>
                    <h5>{donation.receipt.receiptNumber}</h5>
                    <p className="mb-1 text-muted">Status</p>
                    <p>
                      {donation.receipt.deliveryStatus === 'DELIVERED' ? (
                        <Badge bg="success">Delivered</Badge>
                      ) : donation.receipt.deliveryStatus === 'SENT' ? (
                        <Badge bg="info">Sent</Badge>
                      ) : (
                        <Badge bg="warning">Pending</Badge>
                      )}
                    </p>
                    <div className="d-grid gap-2 mt-3">
                      <Button 
                        variant="outline-primary"
                        as="a" 
                        href={`/api/v1/receipts/${donation.receipt.id}/download`}
                        target="_blank"
                      >
                        <FaPrint className="me-2" /> Download Receipt
                      </Button>
                      <div className="d-flex gap-2 mt-2">
                        <Button 
                          variant="outline-success" 
                          className="flex-grow-1"
                          onClick={() => handleSendReceipt('WHATSAPP')}
                          disabled={sendingReceipt}
                        >
                          <FaWhatsapp />
                        </Button>
                        <Button 
                          variant="outline-info" 
                          className="flex-grow-1"
                          onClick={() => handleSendReceipt('EMAIL')}
                          disabled={sendingReceipt}
                        >
                          <FaEnvelope />
                        </Button>
                        <Button 
                          variant="outline-secondary" 
                          className="flex-grow-1"
                          onClick={() => handleSendReceipt('SMS')}
                          disabled={sendingReceipt}
                        >
                          <FaSms />
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-muted mb-3">No receipt has been generated yet.</p>
                    <div className="d-grid">
                      <Button 
                        variant="primary" 
                        onClick={() => handleGenerateReceipt('EMAIL')}
                        disabled={generatingReceipt}
                      >
                        {generatingReceipt ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Generating...
                          </>
                        ) : (
                          'Generate Receipt'
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </Layout>
  );
};

export default DonationDetail;