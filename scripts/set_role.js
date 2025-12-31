/* eslint-disable no-console */
import mongoose from 'mongoose';
import User from '../src/models/user.model.js';
import constants from '../src/config/constants.js';

const { ROLES } = constants;

const [mobileNumber, role] = process.argv.slice(2);

if (!mobileNumber || !role) {
    console.error('Usage: node scripts/set_role.js <mobile_number> <role>');
    console.error(`Available roles: ${Object.values(ROLES).join(', ')}`);
    process.exit(1);
}

if (!Object.values(ROLES).includes(role)) {
    console.error(`Invalid role! Available roles: ${Object.values(ROLES).join(', ')}`);
    process.exit(1);
}

async function setRole() {
    try {
        await mongoose.connect(constants.MONGO_URL, {
            //   useNewUrlParser: true,
            //   useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        const user = await User.findOne({ mobile_number: mobileNumber });

        if (!user) {
            console.error(`User with mobile number ${mobileNumber} not found!`);
            process.exit(1);
        }

        user.role = role;
        await user.save();

        console.log(`Successfully updated user ${user.first_name} ${user.last_name} (${mobileNumber}) to role ${role}`);
        process.exit(0);
    } catch (error) {
        console.error('Error updating user role:', error);
        process.exit(1);
    }
}

setRole();
