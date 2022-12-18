/**
 * Placeholder string used by messages to insert values
 */
export const PLACEHOLDER: string = "$VAL$";

/**
 * Information service manufacturer field
 */
export const INFO_MANUFACTURER: string  = "Dyson";

/**
 * Information service model field
 */
export const INFO_MODEL: string = "BP01";

/**
 * Information service serial number field
 */
export const INFO_SERIAL_NUMBER: string = "Printed Under Machine";

/**
 * Identify message when BroadLink RM is not connected
 */
export const IDENTIFY_NOT_CONNECTED: string = "Identified; not connected to BroadLink RM";

/**
 * Identify message when BroadLink RM is connected
 */
export const IDENTIFY_CONNECTED: string = "Identified; connected to BroadLink RM [" + PLACEHOLDER + "]";

/**
 * Message shown when searching for BroadLink RM
 */
export const DEVICE_SEARCHING: string = "Searching for BroadLink RM...";

/**
 * Message shown when BroadLink RM is discovered
 */
export const DEVICE_DISCOVERED: string = "Discovered BroadLink RM [" + PLACEHOLDER + "]";

/**
 * Message shown when attempting to reconnect to BroadLink RM
 */
export const DEVICE_RECONNECTING: string = "Reconnecting to BroadLink RM...";

/**
 * Message shown when BroadLink RM is reconnected
 */
export const DEVICE_RECONNECTED: string = "Reconnected to BroadLink RM";

/**
 * Message shown when initializing Active
 */
export const ACTIVE_INIT: string = "Active initialized to " + PLACEHOLDER;

/**
 * Message shown when setting Active
 */
export const ACTIVE_SET: string = "Active set to " + PLACEHOLDER;

/**
 * Message shown when initializing Rotation Speed
 */
export const ROTATION_SPEED_INIT: string = "Rotation Speed initialized to " + PLACEHOLDER + "%";

/**
 * Message shown when setting Rotation Speed
 */
export const ROTATION_SPEED_SET: string = "Rotation Speed set to " + PLACEHOLDER + "%";

/**
 * Message shown when initializing Swing Mode
 */
export const SWING_MODE_INIT: string = "Swing Mode initialized to " + PLACEHOLDER;

/**
 * Message shown when setting Swing Mode
 */
export const SWING_MODE_SET: string = "Swing Mode set to " + PLACEHOLDER;