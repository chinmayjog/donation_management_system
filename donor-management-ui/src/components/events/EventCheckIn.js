import React, { useState, useEffect, useCallback } from 'react';
import { Container, Card, Row, Col, Button, Form, InputGroup, Table, Badge, Alert } from 'react-bootstrap';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { FaSearch, FaQrcode, FaCheckCircle } from 'react-icons/fa';
import Layout from '../layout/Layout';
import { getEventById, getEventAttendees } from '../../services/eventService';
import { toast } from 'react-toastify';

const EventCheckIn = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [filteredAttendees, setFilteredAttendees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch event and attendees data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const eventData = await getEventById(id);
        setEvent(eventData);
        
        const attendeesResponse = await getEventAttendees(id);
        setAttendees(attendeesResponse.data || []);
        setFilteredAttendees(attendeesResponse.data || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load event data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // Filter attendees based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredAttendees(attendees);
      return;
    }

    const lowerCaseSearch = searchTerm.toLowerCase();
    const filtered = attendees.filter(attendee => {
      const fullName = `${attendee.donor.firstName} ${attendee.donor.lastName}`.toLowerCase();
      const email = attendee.donor.email?.toLowerCase() || '';
      const phone = attendee.donor.phone?.toLowerCase() || '';
      
      return fullName.includes(lowerCaseSearch) || 
             email.includes(lowerCaseSearch) || 
             phone.includes(lowerCaseSearch);
    });
    
    setFilteredAttendees(filtered);
  }, [searchTerm, attendees]);

  // Mock function to simulate check-in
  // In a real implementation, this would call an API
  const handleCheckIn = useCallback(async (attendeeId) => {
    // Simulate API call with a small delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Update the local state
    setAttendees(prevAttendees => 
      prevAttendees.map(attendee => 
        attendee.id === attendeeId 
          ? { ...attendee, status: 'CHECKED_IN' } 
          : attendee
      )
    );
    
    // Also update filtered attendees
    setFilteredAttendees(prevAttendees => 
      prevAttendees.map(attendee => 
        attendee.id === attendeeId 
          ? { ...attendee, status: 'CHECKED_IN' } 
          : attendee
      )
    );
    
    toast.success('Attendee checked in successfully');
  }, []);

  if (loading) {
    return (
      <Layout>
        <Container>
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading attendees...</span>
            </div>
            <p className="mt-2">Loading attendees...</p>
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
          <Button onClick={() => navigate(`/events/${id}`)} variant="primary">
            Back to Event
          </Button>
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

  return (
    <Layout>
      <Container>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h3>Check-in: {event.title}</h3>
          <Button onClick={() => navigate(`/events/${id}`)} variant="outline-primary">
            Back to Event
          </Button>
        </div>

        <Card className="mb-4">
          <Card.Body>
            <Row>
              <Col md={6}>
                <h5>Event Details</h5>
                <p className="mb-1"><strong>Date:</strong> {new Date(event.eventDate).toLocaleDateString()}</p>
                <p className="mb-1"><strong>Time:</strong> {event.startTime} - {event.endTime}</p>
                <p className="mb-0"><strong>Location:</strong> {event.location}</p>
              </Col>
              <Col md={6}>
                <h5>Check-in Stats</h5>
                <p className="mb-1"><strong>Total Registered:</strong> {attendees.length}</p>
                <p className="mb-1">
                  <strong>Checked In:</strong> {attendees.filter(a => a.status === 'CHECKED_IN').length}
                </p>
                <p className="mb-0">
                  <strong>Pending:</strong> {attendees.filter(a => a.status !== 'CHECKED_IN' && a.status !== 'CANCELLED').length}
                </p>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <Card className="mb-4">
          <Card.Body>
            <Row className="align-items-center mb-4">
              <Col>
                <h5 className="mb-0">Attendees</h5>
              </Col>
              <Col md={6}>
                <InputGroup>
                  <Form.Control
                    placeholder="Search by name, email, or phone"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Button variant="outline-secondary">
                    <FaSearch />
                  </Button>
                </InputGroup>
              </Col>
              <Col md="auto">
                <Button variant="success">
                  <FaQrcode className="me-2" /> Scan QR Code
                </Button>
              </Col>
            </Row>

            {filteredAttendees.length === 0 ? (
              <p className="text-center text-muted">No attendees found</p>
            ) : (
              <Table responsive hover>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Seat</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendees.map((attendee) => (
                    <tr key={attendee.id}>
                      <td>
                        <Link to={`/donors/${attendee.donor.id}`} className="text-decoration-none">
                          {attendee.donor.firstName} {attendee.donor.lastName}
                        </Link>
                      </td>
                      <td>{attendee.donor.email}</td>
                      <td>{attendee.donor.phone}</td>
                      <td>
                        {attendee.seat ? 
                          `${attendee.seat.section}-${attendee.seat.row}-${attendee.seat.number}` : 
                          'Not assigned'}
                      </td>
                      <td>
                        <Badge 
                          bg={
                            attendee.status === 'CHECKED_IN' ? 'success' : 
                            attendee.status === 'CANCELLED' ? 'danger' : 
                            'info'
                          }
                        >
                          {attendee.status}
                        </Badge>
                      </td>
                      <td>
                        {attendee.status === 'CHECKED_IN' ? (
                          <Button variant="outline-success" size="sm" disabled>
                            <FaCheckCircle className="me-1" /> Checked In
                          </Button>
                        ) : attendee.status !== 'CANCELLED' ? (
                          <Button 
                            variant="success" 
                            size="sm"
                            onClick={() => handleCheckIn(attendee.id)}
                          >
                            Check In
                          </Button>
                        ) : (
                          <Button variant="outline-danger" size="sm" disabled>
                            Cancelled
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>
      </Container>
    </Layout>
  );
};

export default EventCheckIn;
