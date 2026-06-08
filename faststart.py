#!/usr/bin/env python3
"""Relocate moov atom to the front (faststart) and patch stco/co64 chunk
offsets. Optionally rewrite the ftyp brand so a .mov remuxes to a Chrome-
friendly .mp4. Pure-Python, no ffmpeg required."""
import struct
import sys

CONTAINERS = {b'moov', b'trak', b'mdia', b'minf', b'stbl', b'edts',
              b'dinf', b'udta', b'mvex'}


def parse_atoms(buf, start, end):
    """Yield (type, atom_start, header_size, atom_end)."""
    i = start
    while i + 8 <= end:
        size = struct.unpack('>I', buf[i:i + 4])[0]
        typ = bytes(buf[i + 4:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack('>Q', buf[i + 8:i + 16])[0]
            hdr = 16
        elif size == 0:
            size = end - i
        yield typ, i, hdr, i + size
        i += size


def find_moov_top(buf):
    for typ, s, hdr, e in parse_atoms(buf, 0, len(buf)):
        if typ == b'moov':
            return s, e
    return None, None


def patch_offsets(buf, start, end, shift):
    """Recurse through container atoms, add `shift` to every stco/co64 entry."""
    for typ, s, hdr, e in parse_atoms(buf, start, end):
        if typ in CONTAINERS:
            patch_offsets(buf, s + hdr, e, shift)
        elif typ == b'stco':
            n = struct.unpack('>I', buf[s + hdr + 4:s + hdr + 8])[0]
            base = s + hdr + 8
            for k in range(n):
                off = base + k * 4
                v = struct.unpack('>I', buf[off:off + 4])[0]
                struct.pack_into('>I', buf, off, v + shift)
        elif typ == b'co64':
            n = struct.unpack('>I', buf[s + hdr + 4:s + hdr + 8])[0]
            base = s + hdr + 8
            for k in range(n):
                off = base + k * 8
                v = struct.unpack('>Q', buf[off:off + 8])[0]
                struct.pack_into('>Q', buf, off, v + shift)


def main(src, dst, remux=True):
    with open(src, 'rb') as f:
        data = bytearray(f.read())

    ms, me = find_moov_top(data)
    if ms is None:
        print('no moov atom found'); return 1
    moov = bytearray(data[ms:me])
    print(f'moov at {ms}..{me} ({me - ms} bytes), file {len(data)} bytes')

    # ftyp stays at front; rebuild file as: [ftyp][moov][rest-without-moov]
    # Find ftyp extent.
    ftyp_end = 0
    for typ, s, hdr, e in parse_atoms(data, 0, len(data)):
        if typ == b'ftyp':
            ftyp_end = e
            break

    if remux:
        # rewrite ftyp -> isom/mp42 so Chrome accepts the .mp4
        new_ftyp = struct.pack('>I', 8 + 8 + 12) + b'ftyp' + b'isom' + \
            struct.pack('>I', 0x200) + b'isom' + b'iso2' + b'mp41'
        head = bytearray(new_ftyp)
    else:
        head = bytearray(data[:ftyp_end])

    rest = bytearray(data[ftyp_end:ms]) + bytearray(data[me:])

    # moov moves from offset ms to offset len(head). All mdat chunk offsets
    # were absolute from file start; shift = new_moov_pos + moov_len - old.
    new_moov_pos = len(head)
    # data after moov now begins at len(head)+len(moov). Original media (mdat)
    # started at ftyp_end (== position right after old ftyp). New media starts
    # at len(head)+len(moov). Shift offsets by that delta.
    old_media_start = ftyp_end
    new_media_start = len(head) + len(moov)
    shift = new_media_start - old_media_start
    print(f'patching offsets by shift={shift}')
    patch_offsets(moov, 0, len(moov), shift)

    out = head + moov + rest
    with open(dst, 'wb') as f:
        f.write(out)
    print(f'wrote {dst} ({len(out)} bytes)')
    return 0


if __name__ == '__main__':
    src = sys.argv[1]
    dst = sys.argv[2]
    sys.exit(main(src, dst))
