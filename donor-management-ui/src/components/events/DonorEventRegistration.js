import React, { useState, useEffect, useCallback } from 'react';
import { Container, Form, Button, Card, Row, Col, Alert, Table } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../layout/Layout';
import { getEventById, registerDonorForEvent } from '../../services/eventService';
import { getAllDonors } from '../../services/donorService';
import { toast } from 'react-toastify';

const DonorEventRegistration = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [donors, setDonors] = useState([]);
  const [selectedDonor, setSelectedDonor] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch event details
  useEffect(() => {
    const fetchEventData = async () => {
      try {
        const eventData = await getEventById(id);
        setEvent(eventData);
      } catch (error) {
        console.error('Error fetching event:', error);
        setError('Failed to load event data');
      } finally {
        setLoading(false);
      }
    };

    fetchEventData();
  }, [id]);

  // Fetch donors based on search term
  const fetchDonors = useCallback(async () => {
    if (!searchTerm) return;
    
    try {
      const response = await getAllDonors({ search: searchTerm });
      setDonors(response.data || []);
    } catch (error) {
      console.error('Error fetching donors:', error);
      toast.error('Failed to search donors');
    }
  }, [searchTerm]);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchTerm) {
        fetchDonors();
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, fetchDonors]);

  const handleDonorSearch = (e) => {
    e.preventDefault();
    fetchDonors();
  };

  const handleSelectDonor = (donorId) => {
    setSelectedDonor(donorId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedDonor) {
      setError('Please select a donor');
      return;
    }
    
    setSubmitting(true);
    setError('');

    try {
      await registerDonorForEvent(id, { donorId: selectedDonor });
      toast.success('Donor registered successfully for the event');
      navigate(`/events/${id}`);
    } catch (error) {
      console.error('Error registering donor:', error);
      setError(error.message || 'Failed to register donor');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Container>
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading event details...</span>
            </div>
            <p className="mt-2">Loading event details...</p>
          </div>
        </Container>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout>
        <Container>
          <Alert variant="warning">Event not found</Alert>
          <Button onClick={() => navigate('/events')} variant="primary">
            Back to Events
          </Button>
        </Container>
      </Layout>
    );
  }

  // Check if event is full
  const isEventFull = event.registeredCount >= event.maxCapacity;

  // Check if event is not scheduled
  const cannotRegister = event.status !== 'SCHEDULED' || isEventFull;

  return (
    <Layout>
      <Container>
        <h3 className="mb-4">Register Donor for {event.title}</h3>

        {error && <Alert variant="danger">{error}</Alert>}

        {cannotRegister && (
          <Alert variant="warning">
            {isEventFull 
              ? 'This event has reached its maximum capacity.' 
              : `Cannot register donors for events with status: ${event.status}`}
          </Alert>
        )}

        <Card className="mb-4">
          <Card.Body>
            <h5 className="mb-3">Event Details</h5>
            <Row>
              <Col md={4}>
                <p><strong>Date:</strong> {new Date(event.eventDate).toLocaleDateString()}</p>
              </Col>
              <Col md={4}>
                <p><strong>Time:</strong> {event.startTime} - {event.endTime}</p>
              </Col>
              <Col md={4}>
                <p><strong>Location:</strong> {event.location}</p>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <p><strong>Capacity:</strong> {event.registeredCount} / {event.maxCapacity}</p>
              </Col>
              <Col md={6}>
                <p><strong>Available Seats:</strong> {event.maxCapacity - event.registeredCount}</p>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body>
            <h5 className="mb-3">Donor Selection</h5>
            <Form onSubmit={handleDonorSearch}>
              <Row className="align-items-end">
                <Col md={9}>
                  <Form.Group className="mb-3">
                    <Form.Label>Search Donors</Form.Label>
                    <Form.Control
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name, email, or phone"
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Button 
                    type="submit" 
                    variant="outline-primary" 
                    className="mb-3 w-100"
                  >
                    Search
                  </Button>
                </Col>
              </Row>
            </Form>
            
            {donors.length > 0 ? (
              <Table responsive hover className="mt-3">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {donors.map((donor) => (
                    <tr key={donor.id}>
                      <td>{donor.firstName} {donor.lastName}</td>
                      <td>{donor.email}</td>
                      <td>{donor.phone}</td>
                      <td>
                        <Button
                          variant={selectedDonor === donor.id ? "primary" : "outline-primary"}
                          size="sm"
                          onClick={() => handleSelectDonor(donor.id)}
                        >
                          {selectedDonor === donor.id ? "Selected" : "Select"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : searchTerm ? (
              <p className="text-muted">No donors found matching "{searchTerm}"</p>
            ) : (
              <p className="text-muted">Search for donors to register</p>
            )}

            <Form onSubmit={handleSubmit} className="mt-4">
              <div className="d-flex justify-content-end">
                <Button
                  variant="secondary"
                  className="me-2"
                  onClick={() => navigate(`/events/${id}`)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  disabled={!selectedDonor || submitting || cannotRegister}
                >
                  {submitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Registering...
                    </>
                  ) : (
                    'Register Donor'
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

export default DonorEventRegistration;
