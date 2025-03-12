import React, { useState, useEffect } from 'react';
import { Container, Card, Row, Col, Button, Badge, Table, Alert, Modal } from 'react-bootstrap';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaCalendarAlt, FaClock, FaMapMarkerAlt, FaUsers, FaEdit, FaTrash } from 'react-icons/fa';
import Layout from '../layout/Layout';
import { getEventById, deleteEvent, getEventAttendees } from '../../services/eventService';
import { toast } from 'react-toastify';

const EventDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    fetchEventData();
  }, [id]);

  const fetchEventData = async () => {
    setLoading(true);
    try {
      const eventData = await getEventById(id);
      setEvent(eventData);
      
      // Fetch attendees
      const attendeesData = await getEventAttendees(id);
      setAttendees(attendeesData.data || []);
    } catch (error) {
      console.error('Error fetching event data:', error);
      setError('Failed to load event data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async () => {
    try {
      await deleteEvent(id);
      toast.success('Event deleted successfully');
      navigate('/events');
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error(error.message || 'Failed to delete event');
      setShowDeleteModal(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'SCHEDULED':
        return 'primary';
      case 'ONGOING':
        return 'success';
      case 'COMPLETED':
        return 'secondary';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'info';
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

  if (error) {
    return (
      <Layout>
        <Container>
          <Alert variant="danger">{error}</Alert>
          <Button onClick={() => navigate('/events')} variant="primary">
            Back to Events
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
          <h3>{event.title}</h3>
          <div>
            <Button
              as={Link}
              to={`/events/${id}/register`}
              variant="success"
              className="me-2"
              disabled={event.status !== 'SCHEDULED' || event.registeredCount >= event.maxCapacity}
            >
              Register Donor
            </Button>
            <Button
              as={Link}
              to={`/events/${id}/edit`}
              variant="primary"
              className="me-2"
            >
              <FaEdit className="me-1" /> Edit
            </Button>
            <Button
              variant="danger"
              onClick={() => setShowDeleteModal(true)}
              disabled={event.status === 'ONGOING' || attendees.length > 0}
            >
              <FaTrash className="me-1" /> Delete
            </Button>
          </div>
        </div>

        {event.monsoonWarning && (
          <Alert variant="warning" className="mb-4">
            {event.monsoonWarning}
          </Alert>
        )}

        <Row>
          <Col lg={8}>
            <Card className="mb-4">
              <Card.Body>
                <h5 className="mb-3">Event Details</h5>
                <div className="mb-3">
                  <p className="mb-2">
                    <FaCalendarAlt className="me-2 text-primary" />
                    <strong>Date:</strong> {formatDate(event.eventDate)}
                  </p>
                  <p className="mb-2">
                    <FaClock className="me-2 text-primary" />
                    <strong>Time:</strong> {event.startTime} - {event.endTime}
                  </p>
                  <p className="mb-2">
                    <FaMapMarkerAlt className="me-2 text-primary" />
                    <strong>Location:</strong> {event.location}
                  </p>
                  <p className="mb-2">
                    <FaUsers className="me-2 text-primary" />
                    <strong>Capacity:</strong> {event.registeredCount} / {event.maxCapacity} registered
                  </p>
                  <p className="mb-0">
                    <strong>Status:</strong>{' '}
                    <Badge bg={getStatusBadgeVariant(event.status)}>
                      {event.status}
                    </Badge>
                  </p>
                </div>
                {event.description && (
                  <div className="mt-4">
                    <h6>Description</h6>
                    <p>{event.description}</p>
                  </div>
                )}
              </Card.Body>
            </Card>

            <Card>
              <Card.Body>
                <h5 className="mb-3">Registered Attendees</h5>
                {attendees.length === 0 ? (
                  <p className="text-muted">No attendees registered yet</p>
                ) : (
                  <Table responsive hover>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Seat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.map((attendee) => (
                        <tr key={attendee.id}>
                          <td>
                            <Link to={`/donors/${attendee.donor.id}`} className="text-decoration-none">
                              {attendee.donor.firstName} {attendee.donor.lastName}
                            </Link>
                          </td>
                          <td>{attendee.donor.email}</td>
                          <td>{attendee.donor.phone}</td>
                          <td>
                            <Badge 
                              bg={attendee.status === 'CHECKED_IN' ? 'success' : 
                                 attendee.status === 'CANCELLED' ? 'danger' : 'info'}
                            >
                              {attendee.status}
                            </Badge>
                          </td>
                          <td>
                            {attendee.seat ? 
                              `${attendee.seat.section}-${attendee.seat.row}-${attendee.seat.number}` : 
                              'Not assigned'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={4}>
            <Card className="mb-4">
              <Card.Body>
                <h5 className="mb-3">Event Stats</h5>
                <div className="stats-item d-flex justify-content-between align-items-center p-2 border-bottom">
                  <span>Registered Attendees</span>
                  <span className="fw-bold">{event.registeredCount}</span>
                </div>
                <div className="stats-item d-flex justify-content-between align-items-center p-2 border-bottom">
                  <span>Available Seats</span>
                  <span className="fw-bold">{event.maxCapacity - event.registeredCount}</span>
                </div>
                <div className="stats-item d-flex justify-content-between align-items-center p-2 border-bottom">
                  <span>Capacity Filled</span>
                  <span className="fw-bold">
                    {Math.round((event.registeredCount / event.maxCapacity) * 100)}%
                  </span>
                </div>
                <div className="stats-item d-flex justify-content-between align-items-center p-2">
                  <span>Created By</span>
                  <span className="fw-bold">{event.createdBy?.username || 'System'}</span>
                </div>
              </Card.Body>
            </Card>

            <Card>
              <Card.Body>
                <h5 className="mb-3">Quick Actions</h5>
                <div className="d-grid gap-2">
                  <Button 
                    as={Link} 
                    to={`/events/${id}/seats`} 
                    variant="outline-primary"
                  >
                    View Seating Chart
                  </Button>
                  <Button 
                    as={Link} 
                    to={`/events/${id}/check-in`} 
                    variant="outline-success"
                    disabled={event.status !== 'SCHEDULED' && event.status !== 'ONGOING'}
                  >
                    Check-in Attendees
                  </Button>
                  <Button 
                    as={Link} 
                    to={`/events/${id}/report`} 
                    variant="outline-info"
                  >
                    Generate Report
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Delete Confirmation Modal */}
        <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Delete Event</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>Are you sure you want to delete this event? This action cannot be undone.</p>
            {attendees.length > 0 && (
              <Alert variant="warning">
                This event has {attendees.length} registered attendees. Please cancel their registrations first.
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleDeleteEvent}
              disabled={attendees.length > 0}
            >
              Delete
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </Layout>
  );
};

export default EventDetail;
