def upgrade():
    # Add new columns
    op.add_column('users', sa.Column('starting_balance', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('starting_balance_date', sa.DateTime(), nullable=True))
    
    # Copy default_account_size to starting_balance for existing users
    op.execute('''
        UPDATE users 
        SET starting_balance = default_account_size,
            starting_balance_date = created_at
        WHERE starting_balance IS NULL
    ''')

def downgrade():
    op.drop_column('users', 'starting_balance_date')
    op.drop_column('users', 'starting_balance')