/**
 * Interval in milliseconds
 */
export const INTERVAL: number = 700;

/**
 * Number of active skips after updating current active to active
 */
export const SKIPS_UPDATE_CURRENT_ACTIVE_ACTIVE: number = 2;

/**
 * Number of active skips after updating current active to inactive
 */
export const SKIPS_UPDATE_CURRENT_ACTIVE_INACTIVE: number = 8;

/**
 * Number of swing mode skips after updating current swing mode
 */
export const SKIPS_UPDATE_CURRENT_SWING_MODE: number = 6;

/**
 * Number of skips after updating sensor characteristics
 */
export const SKIPS_UPDATE_SENSOR_CHARACTERISTICS: number = 86;

/**
 * Number of skips when BroadLink RM ping failed
 */
export const SKIPS_PING_DEVICE_FAIL: number = 4;

/**
 * IR hex code used to toggle active
 */
export const IR_DATA_ACTIVE: string = "26005800481718161916161916311817191619171816192d181918171817181719161817181718" +
    "161a2e1816192d19171800066b45191631190006604817182d1a00066147151a2d190006614916192d190006604618172f18000d05";

/**
 * IR hex code used to increase rotation speed
 */
export const IR_DATA_ROTATION_SPEED_UP: string = "260058004718181619161917172f1817191618171817182c1919172e1618182f161" +
    "916301a2d192d1817182f161817181a00066d4618182d190006614618172f1900065f4817182e1900065f4816182e180006604818172d190" +
    "00d05";

/**
 * IR hex code used to decrease rotation speed
 */
export const IR_DATA_ROTATION_SPEED_DOWN: string = "2600580047161917171719151a2d171818171619161a182d1a15173019151a2d1" +
    "92d1a1718161730161819161718172f1a0006664617182f1900065f4817182e18000660441917301a00065e4818172d1a00065f4618182e1" +
    "9000d05";

/**
 * IR hex code used to toggle swing mode
 */
export const IR_DATA_SWING_MODE: string = "260058004716191517191917192c1619171816191819182d151b1916182d192e1917181718" +
    "2c1730181815301a2d192d160006594718192d1700066243191731180006604816192d190006604717182d190006604817182d18000d05";

/**
 * How many times the identify function should toggle active
 */
export const IDENTIFY_ACTIVE_TOGGLE_COUNT: number = 2;

/**
 * How much to increase or decrease rotation speed by
 * You must clear persist storage for this plugin after changing this!
 */
export const ROTATION_SPEED_STEP_SIZE: number = 10;

/**
 * Accessory name used by Homebridge to assign accessories to plugins
 * You must edit your Homebridge config after changing this!
 */
export const ACCESSORY_NAME: string = "DysonBP01";