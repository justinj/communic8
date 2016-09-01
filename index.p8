-- rpc types --
byte={
  serialize=function(n)
    return {n}
  end,
  deserialize=function(msg, at)
    return {msg[at], at + 1}
  end
}

boolean={
  serialize=function(b)
    return {b and 1 or 0}
  end,
  deserialize=function(msg, at)
    return {msg[at] ~= 0, at + 1}
  end
}

number={
  serialize=function(n)
    return {
      band(shr(n, 8), 255),
      band(n, 255),
      band(shl(n, 8), 255),
      band(shl(n, 16), 255),
    }
  end,
  deserialize=function(msg, at)
    return {
      bor(
        bor(
          bor(shl(msg[at], 8), msg[at + 1]),
          shr(msg[at + 2], 8)),
        shr(msg[at + 3], 16)),
      at + 4
    }
  end
}

array=function(t)
  return {
    serialize=function(ts)
      local result = {flr(#ts / 256), #ts % 256}
      for val in all(ts) do
        for b in all(t.serialize(val)) do
          add(result, b)
        end
      end
      return result
    end,
    deserialize=function(msg, at)
      local length = msg[at] * 256 + msg[at + 1]
      at += 2
      local result = {}
      for i = 1, length do
        local res = t.deserialize(msg, at)
        add(result, res[1])
        at = res[2]
      end
      return {result, at}
    end
  }
end

tuple=function(ts)
  return {
    serialize=function(vs)
      local result = {}
      for i = 1, #vs do
        local ser = ts[i].serialize(vs[i])
        for j in all(ser) do
          add(result, j)
        end
      end
      return result
    end,
    deserialize=function(msg, at)
      local result = {}
      for t in all(ts) do
        local next = t.deserialize(msg, at)
        add(result, next[1])
        at = next[2]
      end
      return {result, at}
    end,
  }
end

function opacify(t)
  return {
    serialize=function(v)
      local ser = t.serialize(v)
      local result = {flr(#ser / 256), #ser % 256}
      for b in all(ser) do
        add(result, b)
      end
      return result
    end,
    deserialize=function(msg, at)
      return t.deserialize(msg, at + 2)
    end
  }
end

functions = {}
functions[0] = { -- add (sample)
	 input={
	   byte,
     byte
	 },
	 output={},
	 execute=function(args)
	 	 return {args[1] + args[2]}
	 end
}

function read_message(message)
  local invc_id = message[1]
  local func_id = message[2]
  local args = {}
  local func = functions[func_id]
  local position = 3
  for input in all(func.input) do
    local arg = input.deserialize(message, position)
    add(args, arg[1])
    position = arg[2]
  end

  -- response
  local values = func.execute(args)
  local serialized_result = {invc_id}
  local i = 1
  for v in all(values) do
    local serialized = func.output[i].serialize(v)
    for b in all(serialized) do
      add(serialized_result, b)
    end
    i += 1
  end
  return serialized_result
end

message_queue = {}
write_queue = {}
local receiver = cocreate(function()
  while true do
    while (yield() == 0) do
    end
    local length = yield()
    length = length * 256 + yield()
    local msg = ''
    local next = {}
    for i = 1, length do
      local v = yield()
      add(next, v)
      msg = msg..','..v
    end
    add(message_queue, next)
  end
end)
coresume(receiver)

function _update_communic8()
  local header = peek(0x5f80)
  if header == 3 then
    poke(0x5f80, 2)
    for i = 0, 126 do
      coresume(receiver, peek(0x5f81 + i))
    end
  end

  while #message_queue > 0 do
    local msg = message_queue[1]
    del(message_queue, msg)
    local response = read_message(msg)

    add(write_queue, 1)
    add(write_queue, flr(#response / 256))
    add(write_queue, #response % 256)
    local msg = ''
    for b in all(response) do
      add(write_queue, b)
      msg = msg..','..b
    end
  end

  if #write_queue > 0 and band(header, 1) == 0 then
    poke(0x5f80, 5)
    for i = 1, 127 do
      if #write_queue > 0 then
        poke(0x5f80 + i, write_queue[1])
        del(write_queue, write_queue[1])
      else
        poke(0x5f80 + i, 0)
      end
    end
    poke(0x5f80, 1)
  end
end

