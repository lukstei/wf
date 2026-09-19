# Deeply Nested Workflow

Root instructions.

## Step 1: Start
Start the process.

## *if:* environment is prod?
Prod setup preamble.

### Step 2a: Check Credentials
Verify AWS STS credentials.

### *if:* database migration required?
Migration preamble.

#### Step 2b-i: Run Migration
Execute flyway / prisma migration.

#### Step 2b-ii: Verify Migration
Verify database tables.

#### *else:* Step 2b-alt: Skip Migration
Log migration skipped.

### Step 2c: Finalize Cloud
Scale up pods.

### *else:* Local Step: Docker Compose
Run docker compose up.

## Step 3: Finish
Announce completion.
