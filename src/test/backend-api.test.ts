import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Note: These are integration tests that require the backend server to be running
// Run with: cd backend && npm start (in one terminal) then npm test (in another)

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

describe('Backend API Integration Tests', () => {
  let authToken: string;
  let testUserId: string;
  
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data.status).toBe('ok');
      expect(data).toHaveProperty('environment');
      expect(data).toHaveProperty('demoMode');
    });
  });
  
  describe('Authentication', () => {
    it('should login with valid credentials', async () => {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@bookexplorer.com',
          password: 'admin123'
        })
      });
      
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('token');
      expect(data.user).toHaveProperty('email', 'admin@bookexplorer.com');
      expect(data.user).toHaveProperty('role', 'admin');
      
      authToken = data.token;
      testUserId = data.user.id;
    });
    
    it('should fail with invalid credentials', async () => {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'wrong@example.com',
          password: 'wrongpassword'
        })
      });
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });
  
  describe('Books API', () => {
    it('should fetch all books', async () => {
      const response = await fetch(`${API_URL}/books`);
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data).toHaveProperty('books');
      expect(Array.isArray(data.books)).toBe(true);
      expect(data).toHaveProperty('pagination');
    });
    
    it('should fetch a single book', async () => {
      // First get all books
      const listResponse = await fetch(`${API_URL}/books`);
      const listData = await listResponse.json();
      
      if (listData.books.length > 0) {
        const bookId = listData.books[0].id;
        const response = await fetch(`${API_URL}/books/${bookId}`);
        const data = await response.json();
        
        expect(response.ok).toBe(true);
        expect(data).toHaveProperty('id', bookId);
        expect(data).toHaveProperty('title');
        expect(data).toHaveProperty('author');
      }
    });
    
    it('should filter books by genre', async () => {
      const response = await fetch(`${API_URL}/books/genre/Fantasy`);
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data).toHaveProperty('genre', 'Fantasy');
      expect(Array.isArray(data.books)).toBe(true);
    });
  });
  
  describe('Authors API', () => {
    it('should fetch all authors', async () => {
      const response = await fetch(`${API_URL}/authors`);
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data).toHaveProperty('authors');
      expect(Array.isArray(data.authors)).toBe(true);
    });
    
    it('should fetch a single author', async () => {
      // First get all authors
      const listResponse = await fetch(`${API_URL}/authors`);
      const listData = await listResponse.json();
      
      if (listData.authors.length > 0) {
        const authorId = listData.authors[0].id;
        const response = await fetch(`${API_URL}/authors/${authorId}`);
        const data = await response.json();
        
        expect(response.ok).toBe(true);
        expect(data).toHaveProperty('id', authorId);
        expect(data).toHaveProperty('name');
      }
    });
  });
  
  describe('Reviews API', () => {
    it('should fetch all reviews', async () => {
      const response = await fetch(`${API_URL}/reviews`);
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data).toHaveProperty('reviews');
      expect(Array.isArray(data.reviews)).toBe(true);
    });
  });
});

describe('Backend Demo Mode Tests', () => {
  // These tests assume DEMO_MODE=false in .env
  // To test demo mode, set DEMO_MODE=true and restart the server
  
  it('should check demo mode status', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    
    expect(data).toHaveProperty('demoMode');
    // The actual value depends on DEMO_MODE environment variable
  });
});
