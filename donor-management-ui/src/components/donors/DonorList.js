import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Form, InputGroup, Table, Pagination, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaSearch, FaPlus, FaFilter } from 'react-icons/fa';
import Layout from '../layout/Layout';
import { getAllDonors } from '../../services/donorService';
import { toast } from 'react-toastify';

const DonorList = () => {
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    city: '',
    state: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 1,
    totalResults: 0
  });

  const fetchDonors = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        search: searchTerm || undefined,
        ...filters
      };
      
      // Filter out undefined values
      Object.keys(params).forEach(key => 
        params[key] === undefined && delete params[key]
      );
      
      const response = await getAllDonors(params);
      setDonors(response.data || []);
      setPagination({
        ...pagination,
        totalPages: response.pagination?.totalPages || 1,
        totalResults: response.pagination?.totalResults || 0
      });
    } catch (error) {
      console.error('Error fetching donors:', error);
      toast.error('Failed to load donors');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, searchTerm, filters]);

  useEffect(() => {
    fetchDonors();
  }, [fetchDonors]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchDonors();
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
          <h3>Donors</h3>
          <Button as={Link} to="/donors/new" variant="primary">
            <FaPlus className="me-2" /> Add Donor
          </Button>
        </div>

        <Card className="mb-4">
          <Card.Body>
            <Form onSubmit={handleSearch}>
              <Row>
                <Col md={6} lg={8}>
                  <InputGroup className="mb-3">
                    <Form.Control
                      placeholder="Search donors by name, email, or phone"
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
                    name="city"
                    value={filters.city}
                    onChange={handleFilterChange}
                    className="mb-3"
                  >
                    <option value="">All Cities</option>
                    <option value="Mumbai">Mumbai</option>
                    <option value="Delhi">Delhi</option>
                    <option value="Bangalore">Bangalore</option>
                  </Form.Select>
                </Col>
                <Col md={3} lg={2}>
                  <Form.Select
                    name="state"
                    value={filters.state}
                    onChange={handleFilterChange}
                    className="mb-3"
                  >
                    <option value="">All States</option>
                    <option value="Maharashtra">Maharashtra</option>
                    <option value="Delhi">Delhi</option>
                    <option value="Karnataka">Karnataka</option>
                  </Form.Select>
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
            <p className="mt-2">Loading donors...</p>
          </div>
        ) : donors.length === 0 ? (
          <Card>
            <Card.Body className="text-center py-5">
              <p className="mb-0">No donors found</p>
            </Card.Body>
          </Card>
        ) : (
          <>
            <Card>
              <Table responsive hover>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Location</th>
                    <th>PAN Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {donors.map((donor) => (
                    <tr key={donor.id}>
                      <td>
                        <Link to={`/donors/${donor.id}`} className="text-decoration-none">
                          {donor.firstName} {donor.lastName}
                        </Link>
                      </td>
                      <td>{donor.email}</td>
                      <td>{donor.phone}</td>
                      <td>{donor.city}, {donor.state}</td>
                      <td>
                        {donor.panVerified ? (
                          <Badge bg="success">Verified</Badge>
                        ) : (
                          <Badge bg="warning">Not Verified</Badge>
                        )}
                      </td>
                      <td>
                        <Button
                          as={Link}
                          to={`/donors/${donor.id}`}
                          variant="outline-primary"
                          size="sm"
                          className="me-2"
                        >
                          View
                        </Button>
                        <Button
                          as={Link}
                          to={`/donors/${donor.id}/edit`}
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
                Showing {donors.length} of {pagination.totalResults} donors
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

export default DonorList;
