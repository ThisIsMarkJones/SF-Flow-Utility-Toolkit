# Ruby 3.2+ removed Object#tainted?; Liquid 4.0.x still calls it.
class Object
  def tainted?
    false
  end
end
