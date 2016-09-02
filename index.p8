_communic8_chars = "\n\32\33\34\35\36\37\38\39\40\41\42\43\44\45\46\47\48\49\50\51\52\53\54\55\56\57\58\59\60\61\62\63\64\65\66\67\68\69\70\71\72\73\74\75\76\77\78\79\80\81\82\83\84\85\86\87\88\89\90\91\92\93\94\95\96\97\98\99\100\101\102\103\104\105\106\107\108\109\110\111\112\113\114\115\116\117\118\119\120\121\122\123\124\125\126\127\128\129\130\131\132\133\134\135\136\137\138\139\140\141\142\143\144\145\146\147\148\149\150\151\152\153"
_communic8_charindices = {}
for i = 1, #_communic8_chars do
  _communic8_charindices[sub(_communic8_chars, i, i)] = 30 + i
end
arg_types = {
  byte={
    serialize=function(n)
      return {n}
    end,
    deserialize=function(msg, at)
      return {msg[at], at + 1}
    end
  },
  boolean={
    serialize=function(b)
      return {b and 1 or 0}
    end,
    deserialize=function(msg, at)
      return {msg[at] ~= 0, at + 1}
    end
  },
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
  },
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
  end,
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
  end,
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
  end,
  string={
    serialize=function(values)
      local result = {flr(#values / 256), #values % 256}
      for i = 1, #values do
        add(result, _communic8_charindices[sub(values, i, i)])
      end
      return result
    end,
    deserialize=function(msg, at)
      local result = ''
      local length = msg[at] * 256 + msg[at + 1]
      at += 2
      for i = 0, length - 1 do
        local ch = msg[at + i]
        result = result..(sub(_communic8_chars, ch - 30, ch - 30))
      end
      c = result
      return {result, at + length}
    end
  }
}

function init_communic8(functions)
  local message_header = 1

  local ready_for_consumption = shl(1, 0)
  local written_by_javascript = shl(1, 1)
  local pico8_lock            = shl(1, 2)

  local header_location = 0x5f80
  local message_location = 0x5f81

  local message_queue = {}
  local write_queue = {}

  local read_message = function(message)
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
        printh('read '..i..' of '..length)
      end
      add(message_queue, next)
    end
  end)
  coresume(receiver)

  local _update_communic8 = function()
    local header = peek(header_location)
    if header == bor(ready_for_consumption, written_by_javascript) then
      poke(header_location, bor(written_by_javascript, pico8_lock))
      for i = 0, 126 do
        coresume(receiver, peek(message_location + i))
      end
      poke(header_location, bor(written_by_javascript))
    end

    while #message_queue > 0 do
      local msg = message_queue[1]
      del(message_queue, msg)
      local response = read_message(msg)

      add(write_queue, message_header)
      add(write_queue, flr(#response / 256))
      add(write_queue, #response % 256)
      for b in all(response) do
        add(write_queue, b)
      end
    end

    if #write_queue > 0 and band(header, 1) == 0 then
      poke(header_location, pico8_lock)
      local to_remove_from_write_queue = 0
      for i = 0, 126 do
        if #write_queue - to_remove_from_write_queue > 0 then
          poke(message_location + i, write_queue[1 + i])
          to_remove_from_write_queue += 1
        else
          poke(message_location + i, 0)
        end
      end
      for i = 1, #write_queue - to_remove_from_write_queue do
        write_queue[i] = write_queue[i + to_remove_from_write_queue]
      end
      for i = #write_queue - to_remove_from_write_queue + 1, #write_queue do
        write_queue[i] = nil
      end
      poke(header_location, ready_for_consumption)
    end
  end
  
  return _update_communic8
end
