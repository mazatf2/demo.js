import {Match} from './Match';
import {EntityId} from './PacketEntity';
import {PlayerCondition} from './PlayerCondition';
import {UserInfo} from './UserInfo';
import {Vector} from './Vector';
import {Weapon} from './Weapon';

export enum LifeState {
	ALIVE = 0,
	DYING = 1,
	DEATH = 2,
	RESPAWNABLE = 3
}

export class Player {
	public match: Match;
	public user: UserInfo;
	public position: Vector = new Vector(0, 0, 0);
	public health: number = 0;
	public maxHealth: number = 0;
	public classId: number = 0;
	public team: number = 0;
	public viewAngle: number = 0;
	public weaponIds: number[] = [];
	public ammo: number[] = [];
	public lifeState: LifeState = LifeState.DEATH;
	public activeWeapon: number = 0;
	public m_nPlayerCond: number;
	public m_nPlayerCondEx: number;
	public m_nPlayerCondEx2: number;
	public m_nPlayerCondEx3: number;
	public _condition_bits: number;

	constructor(match: Match, userInfo: UserInfo) {
		this.match = match;
		this.user = userInfo;
	}

	get weapons(): Weapon[] {
		return this.weaponIds
			.map((id) => this.match.outerMap.get(id) as EntityId)
			.filter((entityId) => entityId > 0)
			.map((entityId) => this.match.weaponMap.get(entityId) as Weapon);
	}

	public hasCondition(cond: PlayerCondition): boolean {
		if (cond < 32) {
			if (this.m_nPlayerCond & 1 << cond) {
				return true;
			}
			if (this._condition_bits & 1 << cond) {
				return true;
			}
		}
		if (cond < 64) {
			if (this.m_nPlayerCondEx & 1 << (cond - 32)) {
				return true;
			}
		}
		if (cond < 96) {
			if (this.m_nPlayerCondEx2 & 1 << (cond - 64)) {
				return true;
			}
		}
		if (cond < 128) {
			if (this.m_nPlayerCondEx3 & 1 << (cond - 96)) {
				return true;
			}
		}
		return false;
	}
}
