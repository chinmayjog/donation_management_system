import React, { useState, useEffect } from 'react';
import { Container, Form, Button, Card, Row, Col, Alert } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../layout/Layout';
import { createDonor, getDonorById, updateDonor } from '../../services/donorService';
import { toast } from 'react-toastify';

const DonorForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    panNumber: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    preferredCommunication: 'email'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEdit, setIsEdit] = useState(false);

  useEffect(() => {
    if (id) {
      setIsEdit(true);
      fetchDonor(id);
    }
  }, [id]);

  const fetchDonor = async (donorId) => {
    setLoading(true);
    try {
      const donor = await getDonorById(donorId);
      setFormData({
        firstName: donor.firstName || '',
        lastName: donor.lastName || '',
        email: donor.email || '',
        phone: donor.phone || '',
        panNumber: donor.panNumber || '',
        address: donor.address || '',
        city: donor.city || '',
        state: donor.state || '',
        postalCode: donor.postalCode || '',
        preferredCommunication: donor.preferredCommunication || 'email'
      });
    } catch (error) {
      console.error('Error fetching donor:', error);
      setError('Failed to load donor data');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isEdit) {
        await updateDonor(id, formData);
        toast.success('Donor updated successfully');
      } else {
        await createDonor(formData);
        toast.success('Donor created successfully');
      }
      navigate('/donors');
    } catch (error) {
      console.error('Error saving donor:', error);
      setError(error.message || 'Failed to save donor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Container>
        <h3 className="mb-4">{isEdit ? 'Edit Donor' : 'Add New Donor'}</h3>

        {error && <Alert variant="danger">{error}</Alert>}

        <Card>
          <Card.Body>
            <Form onSubmit={handleSubmit}>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>First Name</Form.Label>
                    <Form.Control
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Last Name</Form.Label>
                    <Form.Control
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Phone</Form.Label>
                    <Form.Control
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                    />
                    <Form.Text className="text-muted">
                      Format: +919876543210
                    </Form.Text>
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>PAN Number</Form.Label>
                <Form.Control
                  type="text"
                  name="panNumber"
                  value={formData.panNumber}
                  onChange={handleChange}
                />
                <Form.Text className="text-muted">
                  Format: ABCDE1234F
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Address</Form.Label>
                <Form.Control
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                />
              </Form.Group>

              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>City</Form.Label>
                    <Form.Control
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>State</Form.Label>
                    <Form.Control
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Postal Code</Form.Label>
                    <Form.Control
                      type="text"
                      name="postalCode"
                      value={formData.postalCode}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>Preferred Communication</Form.Label>
                <Form.Select
                  name="preferredCommunication"
                  value={formData.preferredCommunication}
                  onChange={handleChange}
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="call">Phone Call</option>
                </Form.Select>
              </Form.Group>

              <div className="d-flex justify-content-end mt-4">
                <Button
                  variant="secondary"
                  className="me-2"
                  onClick={() => navigate('/donors')}
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
                    'Save Donor'
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

export default DonorForm;
