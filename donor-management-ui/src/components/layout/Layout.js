import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import Header from './Header';
import Sidebar from './Sidebar';

const Layout = ({ children }) => {
  return (
    <div>
      <Header />
      <Container fluid>
        <Row>
          <Col md={3} lg={2} className="px-0 d-none d-md-block">
            <Sidebar />
          </Col>
          <Col md={9} lg={10} className="main-content">
            {children}
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Layout;
