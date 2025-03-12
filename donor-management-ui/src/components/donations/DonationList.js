import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Form, InputGroup, Table, Pagination, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaSearch, FaPlus, FaFilter } from 'react-icons/fa';
import Layout from '../layout/Layout';
import { getAllDonations } from '../../services/donationService';
import { toast } from 'react-toastify';

const DonationList = () => {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    paymentMethod: '',
    minAmount: '',
    maxAmount: '',
    startDate: '',
    endDate: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 1,
    totalResults: 0
  });

  const fetchDonations = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        search: searchTerm || undefined,
        ...filters
      };
      
      // Filter out undefined and empty values
      Object.keys(params).forEach(key => 
        (params[key] === undefined || params[key] === '') && delete params[key]
      );
      
      const response = await getAllDonations(params);
      setDonations(response.data || []);
      setPagination({
        ...pagination,
        totalPages: response.pagination?.totalPages || 1,
        totalResults: response.pagination?.totalResults || 0
      });
    } catch (error) {
      console.error('Error fetching donations:', error);
      toast.error('Failed to load donations');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, searchTerm, filters]);

  useEffect(() => {
    fetchDonations();
  }, [fetchDonations]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchDonations();
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value
    });
  };

  const handlePageChange = (page) => {
    setPagination({
      ...pagination,
      page
    });
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
          <h3>Donations</h3>
          <Button as={Link} to="/donations/new" variant="primary">
            <FaPlus className="me-2" /> Add Donation
          </Button>
        </div>

        <Card className="mb-4">
          <Card.Body>
            <Form onSubmit={handleSearch}>
              <Row>
                <Col md={4} lg={4}>
                  <InputGroup className="mb-3">
                    <Form.Control
                      placeholder="Search donations"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Button variant="outline-secondary" type="submit">
                      <FaSearch />
                    </Button>
                  </InputGroup>
                </Col>
                <Col md={4} lg={2}>
                  <Form.Group className="mb-3">
                    <Form.Label>Payment Method</Form.Label>
                    <Form.Select
                      name="paymentMethod"
                      value={filters.paymentMethod}
                      onChange={handleFilterChange}
                    >
                      <option value="">All Methods</option>
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CREDIT_CARD">Credit Card</option>
                      <option value="UPI">UPI</option>
                      <option value="OTHER">Other</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4} lg={2}>
                  <Form.Group className="mb-3">
                    <Form.Label>Min Amount</Form.Label>
                    <Form.Control
                      type="number"
                      name="minAmount"
                      value={filters.minAmount}
                      onChange={handleFilterChange}
                      placeholder="Min Amount"
                    />
                  </Form.Group>
                </Col>
                <Col md={4} lg={2}>
                  <Form.Group className="mb-3">
                    <Form.Label>Max Amount</Form.Label>
                    <Form.Control
                      type="number"
                      name="maxAmount"
                      value={filters.maxAmount}
                      onChange={handleFilterChange}
                      placeholder="Max Amount"
                    />
                  </Form.Group>
                </Col>
                <Col md={4} lg={2}>
                  <Form.Group className="mb-3">
                    <Form.Label>Start Date</Form.Label>
                    <Form.Control
                      type="date"
                      name="startDate"
                      value={filters.startDate}
                      onChange={handleFilterChange}
                    />
                  </Form.Group>
                </Col>
                <Col md={4} lg={2}>
                  <Form.Group className="mb-3">
                    <Form.Label>End Date</Form.Label>
                    <Form.Control
                      type="date"
                      name="endDate"
                      value={filters.endDate}
                      onChange={handleFilterChange}
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
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-2">Loading donations...</p>
          </div>
        ) : donations.length === 0 ? (
          <Card>
            <Card.Body className="text-center py-5">
              <p className="mb-0">No donations found</p>
            </Card.Body>
          </Card>
        ) : (
          <>
            <Card>
              <Table responsive hover>
                <thead>
                  <tr>
                    <th>Donor</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Payment Method</th>
                    <th>Receipt Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {donations.map((donation) => (
                    <tr key={donation.id}>
                      <td>
                        <Link to={`/donors/${donation.donor.id}`} className="text-decoration-none">
                          {donation.donor.firstName} {donation.donor.lastName}
                        </Link>
                      </td>
                      <td>{formatAmount(donation.amount)}</td>
                      <td>{formatDate(donation.donationDate)}</td>
                      <td>{donation.paymentMethod.replace('_', ' ')}</td>
                      <td>
                        {donation.receiptStatus === 'GENERATED' ? (
                          <Badge bg="success">Generated</Badge>
                        ) : donation.receiptStatus === 'DELIVERED' ? (
                          <Badge bg="info">Delivered</Badge>
                        ) : (
                          <Badge bg="warning">Pending</Badge>
                        )}
                      </td>
                      <td>
                        <Button
                          as={Link}
                          to={`/donations/${donation.id}`}
                          variant="outline-primary"
                          size="sm"
                          className="me-2"
                        >
                          View
                        </Button>
                        <Button
                          as={Link}
                          to={`/donations/${donation.id}/edit`}
                          variant="outline-secondary"
                          size="sm"
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <div className="d-flex justify-content-between align-items-center mt-4">
              <p className="mb-0">
                Showing {donations.length} of {pagination.totalResults} donations
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

export default DonationList;