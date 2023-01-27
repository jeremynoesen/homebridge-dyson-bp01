/**
 * Loop interval in milliseconds
 */
export const LOOP_INTERVAL: number = 700;

/**
 * Number of Active loop skips after updating Active to 1
 */
export const LOOP_SKIPS_ACTIVE: number = 2;

/**
 * Number of Active loop skips after updating Active to 0
 */
export const LOOP_SKIPS_INACTIVE: number = 8;

/**
 * Number of Swing Mode loop skips after updating Swing Mode
 */
export const LOOP_SKIPS_SWING_MODE: number = 6;

/**
 * Number of device loop skips when reconnecting
 */
export const LOOP_SKIPS_DEVICE: number = 4;

/**
 * IR hex code used to toggle Active
 */
export const SIGNAL_ACTIVE: string = "26005800481718161916161916311817191619171816192d181918171817181719161817181718161a2e1816192d19171800066b45191631190006604817182d1a00066147151a2d190006614916192d190006604618172f18000d05";

/**
 * IR hex code used to turn up Rotation Speed
 */
export const SIGNAL_ROTATION_SPEED_UP: string = "260058004718181619161917172f1817191618171817182c1919172e1618182f161916301a2d192d1817182f161817181a00066d4618182d190006614618172f1900065f4817182e1900065f4816182e180006604818172d19000d05";

/**
 * IR hex code used to turn down Rotation Speed
 */
export const SIGNAL_ROTATION_SPEED_DOWN: string = "2600580047161917171719151a2d171818171619161a182d1a15173019151a2d192d1a1718161730161819161718172f1a0006664617182f1900065f4817182e18000660441917301a00065e4818172d1a00065f4618182e19000d05";

/**
 * IR hex code used to toggle Swing Mode
 */
export const SIGNAL_SWING_MODE: string = "260058004716191517191917192c1619171816191819182d151b1916182d192e19171817182c1730181815301a2d192d160006594718192d1700066243191731180006604816192d190006604717182d190006604817182d18000d05";

/**
 * How many times the identify function should toggle Active
 */
export const IDENTIFY_ACTIVE_TOGGLES: number = 2;

/**
 * How much to increase or decrease Rotation Speed by
 * You must clear persist storage for this plugin after changing this!
 */
export const ROTATION_SPEED_STEP_SIZE: number = 10;

/**
 * Accessory identifier used by Homebridge to assign accessories to plugins
 * You must edit your Homebridge config after changing this!
 */
export const ACCESSORY_IDENTIFIER: string = "DysonBP01";