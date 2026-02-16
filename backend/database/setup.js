const { sequelize } = require('../src/config/database');
const models = require('../src/modules');

// Seed data
const seedData = {
  users: [
    {
      username: 'admin',
      email: 'admin@bookexplorer.com',
      password: 'admin123',
      displayName: 'Administrator',
      role: 'admin',
      isActive: true
    },
    {
      username: 'reader1',
      email: 'reader@example.com',
      password: 'reader123',
      displayName: 'John Reader',
      role: 'reader',
      isActive: true
    }
  ],
  
  authors: [
    {
      name: 'J.K. Rowling',
      biography: 'British author, best known for the Harry Potter series',
      nationality: 'British',
      website: 'https://www.jkrowling.com'
    },
    {
      name: 'George R.R. Martin',
      biography: 'American novelist and short story writer, known for A Song of Ice and Fire',
      nationality: 'American',
      website: 'https://georgerrmartin.com'
    },
    {
      name: 'J.R.R. Tolkien',
      biography: 'English writer and philologist, author of The Lord of the Rings',
      nationality: 'British'
    }
  ],
  
  books: [
    {
      title: "Harry Potter and the Philosopher's Stone",
      isbn: '9780747532699',
      genre: 'Fantasy',
      description: 'The first novel in the Harry Potter series',
      publishedDate: '1997-06-26',
      pageCount: 223,
      status: 'active'
    },
    {
      title: 'A Game of Thrones',
      isbn: '9780553103540',
      genre: 'Fantasy',
      description: 'The first novel in A Song of Ice and Fire series',
      publishedDate: '1996-08-01',
      pageCount: 694,
      status: 'active'
    },
    {
      title: 'The Fellowship of the Ring',
      isbn: '9780618346257',
      genre: 'Fantasy',
      description: 'The first volume of The Lord of the Rings',
      publishedDate: '1954-07-29',
      pageCount: 423,
      status: 'active'
    }
  ],
  
  roles: [
    {
      name: 'reader',
      description: 'Standard reader role with basic permissions',
      permissions: [
        'books.books.read',
        'reviews.reviews.create',
        'reviews.reviews.read'
      ],
      isSystemRole: true,
      isActive: true
    },
    {
      name: 'author',
      description: 'Author role with content creation permissions',
      permissions: [
        'books.books.create',
        'books.books.update',
        'books.authors.update'
      ],
      isSystemRole: true,
      isActive: true
    },
    {
      name: 'moderator',
      description: 'Moderator role with content moderation permissions',
      permissions: [
        'reviews.reviews.moderate',
        'books.books.moderate'
      ],
      isSystemRole: true,
      isActive: true
    },
    {
      name: 'admin',
      description: 'Administrator with full permissions',
      permissions: ['*'],
      isSystemRole: true,
      isActive: true
    }
  ],
  
  permissions: [
    { module: 'books', resource: 'books', action: 'create', description: 'Create new books', isActive: true },
    { module: 'books', resource: 'books', action: 'read', description: 'Read book information', isActive: true },
    { module: 'books', resource: 'books', action: 'update', description: 'Update book information', isActive: true },
    { module: 'books', resource: 'books', action: 'delete', description: 'Delete books', isActive: true },
    { module: 'books', resource: 'books', action: 'moderate', description: 'Moderate book content', isActive: true },
    { module: 'reviews', resource: 'reviews', action: 'create', description: 'Create reviews', isActive: true },
    { module: 'reviews', resource: 'reviews', action: 'read', description: 'Read reviews', isActive: true },
    { module: 'reviews', resource: 'reviews', action: 'update', description: 'Update reviews', isActive: true },
    { module: 'reviews', resource: 'reviews', action: 'delete', description: 'Delete reviews', isActive: true },
    { module: 'reviews', resource: 'reviews', action: 'moderate', description: 'Moderate reviews', isActive: true }
  ]
};

async function migrate() {
  console.log('Running migrations...');
  
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection established');
    
    await sequelize.sync({ force: false, alter: true });
    console.log('✓ Database schema synchronized');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

async function seed() {
  console.log('Seeding database...');
  
  try {
    // Seed Roles
    console.log('Seeding roles...');
    for (const roleData of seedData.roles) {
      await models.Role.findOrCreate({
        where: { name: roleData.name },
        defaults: roleData
      });
    }
    console.log('✓ Roles seeded');
    
    // Seed Permissions
    console.log('Seeding permissions...');
    for (const permData of seedData.permissions) {
      await models.Permission.findOrCreate({
        where: { 
          module: permData.module,
          resource: permData.resource,
          action: permData.action
        },
        defaults: permData
      });
    }
    console.log('✓ Permissions seeded');
    
    // Seed Users
    console.log('Seeding users...');
    for (const userData of seedData.users) {
      await models.User.findOrCreate({
        where: { email: userData.email },
        defaults: userData
      });
    }
    console.log('✓ Users seeded');
    
    // Seed Authors
    console.log('Seeding authors...');
    const createdAuthors = [];
    for (const authorData of seedData.authors) {
      const [author] = await models.Author.findOrCreate({
        where: { name: authorData.name },
        defaults: authorData
      });
      createdAuthors.push(author);
    }
    console.log('✓ Authors seeded');
    
    // Seed Books
    console.log('Seeding books...');
    for (let i = 0; i < seedData.books.length; i++) {
      const bookData = { ...seedData.books[i], authorId: createdAuthors[i].id };
      await models.Book.findOrCreate({
        where: { isbn: bookData.isbn },
        defaults: bookData
      });
    }
    console.log('✓ Books seeded');
    
    console.log('✓ Database seeding completed successfully');
    
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}

async function reset() {
  console.log('Resetting database...');
  
  try {
    await sequelize.sync({ force: true });
    console.log('✓ Database reset completed');
    
    await seed();
    
  } catch (error) {
    console.error('Reset failed:', error);
    throw error;
  }
}

// CLI
const command = process.argv[2];

(async () => {
  try {
    switch (command) {
      case 'migrate':
        await migrate();
        break;
      case 'seed':
        await migrate();
        await seed();
        break;
      case 'reset':
        await reset();
        break;
      default:
        console.log('Usage: node setup.js [migrate|seed|reset]');
        process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
})();
