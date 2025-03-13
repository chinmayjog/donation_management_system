import React, { useState, useEffect } from 'react';
import { Container, Form, Button, Card, Row, Col, Alert } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../layout/Layout';
import { createDonation, getDonationById, updateDonation } from '../../services/donationService';
import { getAllDonors } from '../../services/donorService';
import { toast } from 'react-toastify';

const DonationForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [donors, setDonors] = useState([]);
  const [formData, setFormData] = useState({
    donorId: '',
    amount: '',
    donationDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'CASH',
    transactionReference: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    fetchDonors();
    
    if (id) {
      setIsEdit(true);
      fetchDonation(id);
    }
  }, [id]);

  const fetchDonors = async () => {
    try {
      const response = await getAllDonors({ limit: 100 });
      setDonors(response.data || []);
    } catch (error) {
      console.error('Error fetching donors:', error);
      toast.error('Failed to load donor list');
    }
  };

  const fetchDonation = async (donationId) => {
    setLoading(true);
    try {
      const donation = await getDonationById(donationId);
      
      // Format the date to YYYY-MM-DD for the date input
      const formattedDate = new Date(donation.donationDate).toISOString().split('T')[0];
      
      setFormData({
        donorId: donation.donor.id,
        amount: donation.amount,
        donationDate: formattedDate,
        paymentMethod: donation.paymentMethod,
        transactionReference: donation.transactionReference || '',
        notes: donation.notes || ''
      });
    } catch (error) {
      console.error('Error fetching donation:', error);
      setError('Failed to load donation data');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const validateForm = () => {
    if (!formData.donorId) {
      setError('Please select a donor');
      return false;
    }
    if (!formData.amount || formData.amount <= 0) {
      setError('Please enter a valid amount');
      return false;
    }
    if (!formData.donationDate) {
      setError('Please select a donation date');
      return false;
    }
    if (!formData.paymentMethod) {
      setError('Please select a payment method');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      if (isEdit) {
        await updateDonation(id, formData);
        toast.success('Donation updated successfully');
      } else {
        await createDonation(formData);
        toast.success('Donation recorded successfully');
      }
      navigate('/donations');
    } catch (error) {
      console.error('Error saving donation:', error);
      setError(error.message || 'Failed to save donation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Container>
        <h3 className="mb-4">{isEdit ? 'Edit Donation' : 'Record New Donation'}</h3>

        {error && <Alert variant="danger">{error}</Alert>}

        <Card>
          <Card.Body>
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-4">
                <Form.Label>Donor</Form.Label>
                <Form.Select
                  name="donorId"
                  value={formData.donorId}
                  onChange={handleChange}
                  required
                  disabled={isEdit} // Don't allow changing donor in edit mode
                >
                  <option value="">Select Donor</option>
                  {donors.map(donor => (
                    <option key={donor.id} value={donor._id}>
                      {donor.firstName} {donor.lastName} ({donor.email})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Amount (₹)</Form.Label>
                    <Form.Control
                      type="number"
                      min="1"
                      step="0.01"
                      name="amount"
                      value={formData.amount}
                      onChange={handleChange}
                      placeholder="0.00"
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Donation Date</Form.Label>
                    <Form.Control
                      type="date"
                      name="donationDate"
                      value={formData.donationDate}
                      onChange={handleChange}
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Payment Method</Form.Label>
                    <Form.Select
                      name="paymentMethod"
                      value={formData.paymentMethod}
                      onChange={handleChange}
                      required
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CREDIT_CARD">Credit Card</option>
                      <option value="UPI">UPI</option>
                      <option value="OTHER">Other</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Transaction Reference</Form.Label>
                    <Form.Control
                      type="text"
                      name="transactionReference"
                      value={formData.transactionReference}
                      onChange={handleChange}
                      placeholder="Transaction ID, Cheque Number, etc."
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>Notes</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Any additional information about this donation"
                />
              </Form.Group>

              <div className="d-flex justify-content-end mt-4">
                <Button
                  variant="secondary"
                  className="me-2"
                  onClick={() => navigate('/donations')}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : (
                    'Save Donation'
                  )}
                </Button>
              </div>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    </Layout>
  );
};

export default DonationForm;