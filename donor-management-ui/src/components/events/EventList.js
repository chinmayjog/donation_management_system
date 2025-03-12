import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Form, InputGroup, Table, Pagination, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaSearch, FaPlus, FaFilter, FaCalendarAlt, FaUsers, FaMapMarkerAlt } from 'react-icons/fa';
import Layout from '../layout/Layout';
import { getAllEvents } from '../../services/eventService';
import { toast } from 'react-toastify';

const EventList = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    location: ''
  });
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 1,
    totalResults: 0
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        status: filters.status || undefined,
        location: filters.location || undefined,
        startDate: dateRange.startDate || undefined,
        endDate: dateRange.endDate || undefined,
        search: searchTerm || undefined
      };
      
      // Filter out undefined values
      Object.keys(params).forEach(key => 
        params[key] === undefined && delete params[key]
      );
      
      const response = await getAllEvents(params);
      setEvents(response.data || []);
      setPagination({
        ...pagination,
        totalPages: response.pagination?.totalPages || 1,
        totalResults: response.pagination?.totalResults || 0
      });
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, dateRange, searchTerm]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchEvents();
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value
    });
  };

  const handleDateRangeChange = (e) => {
    const { name, value } = e.target;
    setDateRange({
      ...dateRange,
      [name]: value
    });
  };

  const handlePageChange = (page) => {
    setPagination({
      ...pagination,
      page
    });
  };

  // Format date for display
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Get badge variant based on event status
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

  // Generate pagination items
  const paginationItems = [];
  for (let number = 1; number <= pagination.totalPages; number++) {
    paginationItems.push(
      <Pagination.Item 
        key={number} 
        active={number === pagination.page}
        onClick={() => handlePageChange(number)}
      >
        {number}
      </Pagination.Item>
    );
  }

  return (
    <Layout>
      <Container>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h3>Events</h3>
          <Button as={Link} to="/events/new" variant="primary">
            <FaPlus className="me-2" /> Create Event
          </Button>
        </div>

        <Card className="mb-4">
          <Card.Body>
            <Form onSubmit={handleSearch}>
              <Row>
                <Col md={6} lg={8}>
                  <InputGroup className="mb-3">
                    <Form.Control
                      placeholder="Search events by title or location"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Button variant="outline-secondary" type="submit">
                      <FaSearch />
                    </Button>
                  </InputGroup>
                </Col>
                <Col md={3} lg={2}>
                  <Form.Select
                    name="status"
                    value={filters.status}
                    onChange={handleFilterChange}
                    className="mb-3"
                  >
                    <option value="">All Statuses</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="ONGOING">Ongoing</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Form.Select>
                </Col>
                <Col md={3} lg={2}>
                  <Form.Control
                    name="location"
                    placeholder="Filter by location"
                    value={filters.location}
                    onChange={handleFilterChange}
                    className="mb-3"
                  />
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Start Date</Form.Label>
                    <Form.Control
                      type="date"
                      name="startDate"
                      value={dateRange.startDate}
                      onChange={handleDateRangeChange}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>End Date</Form.Label>
                    <Form.Control
                      type="date"
                      name="endDate"
                      value={dateRange.endDate}
                      onChange={handleDateRangeChange}
                    />
                  </Form.Group>
                </Col>
              </Row>
              <div className="d-flex justify-content-end">
                <Button variant="primary" type="submit">
                  <FaFilter className="me-2" /> Apply Filters
                </Button>
              </div>
            </Form>
          </Card.Body>
        </Card>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading events...</span>
            </div>
            <p className="mt-2">Loading events...</p>
          </div>
        ) : events.length === 0 ? (
          <Card>
            <Card.Body className="text-center py-5">
              <p className="mb-0">No events found</p>
            </Card.Body>
          </Card>
        ) : (
          <>
            <Row>
              {events.map((event) => (
                <Col md={6} lg={4} key={event.id} className="mb-4">
                  <Card className="h-100">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <h5 className="card-title mb-0">{event.title}</h5>
                        <Badge bg={getStatusBadgeVariant(event.status)}>
                          {event.status}
                        </Badge>
                      </div>
                      <div className="mb-3">
                        <p className="text-muted mb-1">
                          <FaCalendarAlt className="me-2" />
                          {formatDate(event.eventDate)}
                        </p>
                        <p className="text-muted mb-1">
                          <span className="me-2">🕒</span>
                          {event.startTime} - {event.endTime}
                        </p>
                        <p className="text-muted mb-1">
                          <FaMapMarkerAlt className="me-2" />
                          {event.location}
                        </p>
                        <p className="text-muted mb-0">
                          <FaUsers className="me-2" />
                          {event.registeredCount} / {event.maxCapacity} registered
                        </p>
                      </div>
                      {event.monsoonWarning && (
                        <div className="alert alert-warning mt-2 mb-3" role="alert">
                          <small>{event.monsoonWarning}</small>
                        </div>
                      )}
                      <div className="d-flex justify-content-end mt-3">
                        <Button
                          as={Link}
                          to={`/events/${event.id}`}
                          variant="outline-primary"
                          size="sm"
                          className="me-2"
                        >
                          View
                        </Button>
                        <Button
                          as={Link}
                          to={`/events/${event.id}/edit`}
                          variant="outline-secondary"
                          size="sm"
                        >
                          Edit
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>

            <div className="d-flex justify-content-between align-items-center mt-4">
              <p className="mb-0">
                Showing {events.length} of {pagination.totalResults} events
              </p>
              <Pagination>
                <Pagination.Prev
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                />
                {paginationItems}
                <Pagination.Next
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                />
              </Pagination>
            </div>
          </>
        )}
      </Container>
    </Layout>
  );
};

export default EventList;
