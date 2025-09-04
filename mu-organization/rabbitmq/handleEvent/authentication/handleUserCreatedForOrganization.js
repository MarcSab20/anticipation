import { v4 as uuidv4 } from "uuid";
import { Organization, UserOrganization, User } from "../../../src/index.js";
import { SMPEvents } from "smp-core-tools";
import { rabbitMQService } from "../../../organization.mjs";

/**
 * Handles the "user.created" event by verifying the user exists in the User table
 * and creating a corresponding entry in the UserOrganization table.
 *
 * @param {Object} data - The data from the "user.created" event.
 * @param {Object} context - The execution context, including database and logger.
 * @returns {Promise<void>}
 * @throws {Error} - Throws an error if any step fails.
 */
async function handleUserCreatedForOrganization(data) {
    console.log("Event data: ", data);
    const { user, organizationID, firstName, lastName } = data;
    try {
        // Validate input data
        if (!user || !organizationID) {
            throw new Error("Invalid event data: user and organizationID are required.");
        }

        const newuser = await User.findByPk(user.userID);
        if (!newuser) {
            throw new Error(`User with email ${user.email} does not exist.`);
        }

        // Find the organization by ID
        const organization = await Organization.findByPk(organizationID);
        if (!organization) {
            throw new Error(`Organization with ID ${organizationID} does not exist.`);
        }

        // Generate unique reference and slug for UserOrganization
        const organizationName = organization.name;
        const uniqRef = uuidv4();
        const slug = `${user.username.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uniqRef.substring(0, 8)}`;

        // Create the UserOrganization entry
        await UserOrganization.create({
            uniqRef,
            slug,
            userID: newuser.userID,
            roleID: 3, // Default role: "member"
            organizationID,
            legend: `${organizationName} is a Member of ${organizationName}`,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Remove the user's email from the organization's advancedAttributes
        const advancedAttributes = organization.advancedAttributes ? JSON.parse(organization.advancedAttributes) : {};
        if (advancedAttributes.invitations && advancedAttributes.invitations[user.email]) {
            delete advancedAttributes.invitations[user.email];
            organization.advancedAttributes = JSON.stringify(advancedAttributes);
            await organization.save();
            console.log(`Removed email ${user.email} from advancedAttributes of organization ${organizationID}`);
        }

        // Prepare event data including firstName and lastName if they exist
        const eventData = {
            userIDs: user.userID,
            data: {
                username: user.username,
                organizationName: organizationName,
                organizationID,
                ...(firstName && { firstName }),
                ...(lastName && { lastName })
            },
        };

        // Publish the event with the additional data
        rabbitMQService.publish(SMPEvents.Organization.UserOrganization.created, eventData);

        // Log success
        console.log(`Successfully created UserOrganization entry for userID: ${user.userID} and organizationID: ${organizationID}`);
    } catch (error) {
        // Log error
        console.log(`Failed to handle user.created event: ${error.message}`);
        throw error;
    }
}

export { handleUserCreatedForOrganization };