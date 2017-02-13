import {PacketEntity} from '../../Data/PacketEntity';
import {SendProp} from '../../Data/SendProp';
import {PacketEntitiesPacket} from "../../Data/Packet";
import {BitStream} from 'bit-buffer';
import {Match} from "../../Data/Match";
import {readUBitVar} from "../readBitVar";
import {applyEntityUpdate} from "../EntityDecoder";

enum PVS {
	PRESERVE = 0,
	ENTER    = 1,
	LEAVE    = 2,
	DELETE   = 4
}

function readPVSType(stream: BitStream): PVS {
	// https://github.com/skadistats/smoke/blob/a2954fbe2fa3936d64aee5b5567be294fef228e6/smoke/io/stream/entity.pyx#L24
	let pvs;
	const hi  = stream.readBoolean();
	const low = stream.readBoolean();
	if (low && !hi) {
		pvs = PVS.ENTER;
	} else if (!(hi || low)) {
		pvs = PVS.PRESERVE;
	} else if (hi) {
		pvs = (low) ? (PVS.LEAVE | PVS.DELETE) : PVS.LEAVE;
	} else {
		throw new Error('Invalid pvs');
	}
	return pvs;
}

function readEnterPVS(stream: BitStream, entityId: number, match: Match, baseLine: number): PacketEntity {
	// https://github.com/PazerOP/DemoLib/blob/5f9467650f942a4a70f9ec689eadcd3e0a051956/TF2Net/NetMessages/NetPacketEntitiesMessage.cs#L198
	const serverClass  = match.serverClasses[stream.readBits(match.classBits)];
	const sendTable    = match.getSendTable(serverClass.dataTable);
	const serialNumber = stream.readBits(10);
	if (!sendTable) {
		throw new Error('Unknown SendTable for serverclass');
	}

	const entity = new PacketEntity(serverClass, sendTable, entityId, serialNumber);

	const decodedBaseLine = match.instanceBaselines[baseLine][entityId];
	if (decodedBaseLine) {
		for (let i = 0; i < decodedBaseLine.length; i++) {
			const newProp = decodedBaseLine[i];
			if (!entity.getPropByDefinition(newProp.definition)) {
				entity.props.push(newProp.clone());
			}
		}
	} else {
		const staticBaseLine = match.staticBaseLines[serverClass.id];
		if (staticBaseLine) {
			staticBaseLine.index = 0;
			applyEntityUpdate(entity, sendTable, staticBaseLine);
			if (staticBaseLine.bitsLeft > 7) {
				// console.log(staticBaseLine.length, staticBaseLine.index);
				// throw new Error('Unexpected data left at the end of staticBaseline, ' + staticBaseLine.bitsLeft + ' bits left');
			}
		}
	}
	return entity;
}

function readLeavePVS(match, entityId, shouldDelete) {
	if (shouldDelete) {
		match.packetEntities[entityId] = null;
	}
}

export function PacketEntities(stream: BitStream, match: Match): PacketEntitiesPacket { //26: packetEntities
	// https://github.com/skadistats/smoke/blob/master/smoke/replay/handler/svc_packetentities.pyx
	// https://github.com/StatsHelix/demoinfo/blob/3d28ea917c3d44d987b98bb8f976f1a3fcc19821/DemoInfo/DP/Handler/PacketEntitesHandler.cs
	// https://github.com/StatsHelix/demoinfo/blob/3d28ea917c3d44d987b98bb8f976f1a3fcc19821/DemoInfo/DP/Entity.cs
	// https://github.com/PazerOP/DemoLib/blob/5f9467650f942a4a70f9ec689eadcd3e0a051956/TF2Net/NetMessages/NetPacketEntitiesMessage.cs
	const maxEntries      = stream.readBits(11);
	const isDelta         = !!stream.readBits(1);
	const delta           = (isDelta) ? stream.readInt32() : null;
	const baseLine        = stream.readBits(1);
	const updatedEntries  = stream.readBits(11);
	const length          = stream.readBits(20);
	const updatedBaseLine = stream.readBoolean();
	const end             = stream.index + length;
	let entityId          = -1;

	if (updatedBaseLine) {
		if (baseLine === 0) {
			match.instanceBaselines[1] = match.instanceBaselines[0];
			match.instanceBaselines[0] = new Array((1 << 11)); // array of SendPropDefinition with size MAX_EDICTS
		} else {
			match.instanceBaselines[0] = match.instanceBaselines[1];
			match.instanceBaselines[1] = new Array((1 << 11)); // array of SendPropDefinition with size MAX_EDICTS
		}
	}

	const receivedEntities: PacketEntity[] = [];
	for (let i = 0; i < updatedEntries; i++) {
		const diff = readUBitVar(stream);
		entityId += 1 + diff;
		const pvs  = readPVSType(stream);
		if (pvs === PVS.ENTER) {
			const entity = readEnterPVS(stream, entityId, match, baseLine);
			applyEntityUpdate(entity, entity.sendTable, stream);
			match.packetEntities[entityId] = entity;

			if (updatedBaseLine) {
				const newBaseLine: SendProp[] = [];
				newBaseLine.concat(entity.props);
				match.instanceBaselines[baseLine][entityId] = newBaseLine;
			}
			entity.inPVS = true;
			receivedEntities.push(entity);
		} else if (pvs === PVS.PRESERVE) {
			const entity = match.packetEntities[entityId];
			if (entity) {
				applyEntityUpdate(entity, entity.sendTable, stream);
				receivedEntities.push(entity);
			} else {
				console.log(entityId, match.packetEntities.length);
				throw new Error("unknown entity");
			}
		} else {
			const entity = match.packetEntities[entityId];
			if (entity) {
				entity.inPVS = false;
			}
			readLeavePVS(match, entityId, pvs === PVS.DELETE);
		}
	}

	if (isDelta) {
		while (stream.readBoolean()) {
			const ent                 = stream.readBits(11);
			match.packetEntities[ent] = null;
		}
	}

	stream.index = end;
	return {
		packetType: 'packetEntities',
		entities:   receivedEntities
	};
}
